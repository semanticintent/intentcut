import { createHash } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import type { ObsConnectionOptions, ObsRequestResult, ObsTransport } from "./obs.js";

interface ObsSocket {
  send(data: string): void;
  close(): void;
  on(event: "message", listener: (data: RawData | string) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
}

export type ObsSocketFactory = (url: string, protocol: string) => ObsSocket;

interface ProtocolMessage {
  op: number;
  d: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: ObsRequestResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export function createObsAuthentication(password: string, salt: string, challenge: string): string {
  const secret = createHash("sha256").update(password + salt).digest("base64");
  return createHash("sha256").update(secret + challenge).digest("base64");
}

function decodeMessage(data: RawData | string): ProtocolMessage {
  const text = typeof data === "string"
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : data instanceof ArrayBuffer
        ? Buffer.from(data).toString("utf8")
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  const parsed = JSON.parse(text) as Partial<ProtocolMessage>;
  if (typeof parsed.op !== "number" || !parsed.d || typeof parsed.d !== "object") {
    throw new Error("OBS returned a malformed protocol message.");
  }
  return parsed as ProtocolMessage;
}

export class ObsWebSocketTransport implements ObsTransport {
  private socket: ObsSocket | undefined;
  private identified = false;
  private requestCounter = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly socketFactory: ObsSocketFactory = (url, protocol) => new WebSocket(url, protocol),
    private readonly timeoutMilliseconds = 5_000,
  ) {}

  connect(options: ObsConnectionOptions): Promise<void> {
    if (this.socket) throw new Error("OBS WebSocket transport is already connected or connecting.");
    return new Promise((resolve, reject) => {
      const socket = this.socketFactory(options.url, "obswebsocket.json");
      this.socket = socket;
      let settled = false;
      const timer = setTimeout(() => fail(new Error("Timed out waiting for OBS identification.")), this.timeoutMilliseconds);
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.identified = true;
        resolve();
      };
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket = undefined;
        this.identified = false;
        socket.close();
        reject(error);
      };

      socket.on("message", (data) => {
        try {
          const message = decodeMessage(data);
          if (message.op === 0) {
            const rpcVersion = typeof message.d.rpcVersion === "number" ? Math.min(message.d.rpcVersion, 1) : 1;
            const authentication = message.d.authentication as { salt?: unknown; challenge?: unknown } | undefined;
            if (authentication) {
              if (!options.password) throw new Error("OBS requires authentication but no password was provided.");
              if (typeof authentication.salt !== "string" || typeof authentication.challenge !== "string") {
                throw new Error("OBS returned malformed authentication data.");
              }
              socket.send(JSON.stringify({ op: 1, d: { rpcVersion, authentication: createObsAuthentication(options.password, authentication.salt, authentication.challenge) } }));
            } else {
              socket.send(JSON.stringify({ op: 1, d: { rpcVersion } }));
            }
            return;
          }
          if (message.op === 2) finish();
          if (message.op === 7) this.handleProtocolMessage(data);
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
      socket.on("error", (error) => fail(error));
      socket.on("close", (code, reason) => {
        if (!settled) fail(new Error(`OBS closed before identification (${code}): ${reason.toString("utf8")}`));
        this.handleClose(code, reason.toString("utf8"));
      });
    });
  }

  request(requestType: string, requestData?: Record<string, unknown>): Promise<ObsRequestResult> {
    if (!this.socket || !this.identified) throw new Error("OBS WebSocket transport is not identified.");
    const requestId = `intentcut-${++this.requestCounter}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`OBS request ${requestType} timed out.`));
      }, this.timeoutMilliseconds);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket?.send(JSON.stringify({
        op: 6,
        d: { requestType, requestId, ...(requestData ? { requestData } : {}) },
      }));
    });
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    const socket = this.socket;
    await new Promise<void>((resolve) => {
      socket.on("close", () => resolve());
      socket.close();
    });
    this.socket = undefined;
    this.identified = false;
  }

  private handleClose(code: number, reason: string): void {
    this.identified = false;
    this.socket = undefined;
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`OBS connection closed during request ${requestId} (${code}): ${reason}`));
    }
    this.pending.clear();
  }

  handleProtocolMessage(data: RawData | string): void {
    const message = decodeMessage(data);
    if (message.op !== 7) return;
    const requestId = typeof message.d.requestId === "string" ? message.d.requestId : undefined;
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    const status = message.d.requestStatus as { result?: unknown; code?: unknown; comment?: unknown } | undefined;
    if (status?.result !== true) {
      const code = typeof status?.code === "number" ? status.code : "unknown";
      const comment = typeof status?.comment === "string" ? `: ${status.comment}` : "";
      pending.reject(new Error(`OBS request failed (${code})${comment}`));
      return;
    }
    const responseData = message.d.responseData;
    pending.resolve(responseData && typeof responseData === "object" ? responseData as ObsRequestResult : {});
  }
}
