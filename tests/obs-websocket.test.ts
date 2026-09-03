import { describe, expect, it } from "vitest";
import { createObsAuthentication, ObsWebSocketTransport, type ObsSocketFactory } from "../src/obs-websocket.js";

class FakeSocket {
  sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, Array<(...argumentsList: any[]) => void>>();

  send(data: string): void { this.sent.push(data); }
  close(): void { this.closed = true; }
  on(event: string, listener: (...argumentsList: any[]) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }
  emit(event: string, ...argumentsList: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...argumentsList);
  }
}

function fixture(timeout = 1_000): { socket: FakeSocket; transport: ObsWebSocketTransport; factory: ObsSocketFactory } {
  const socket = new FakeSocket();
  const factory = (() => socket) as unknown as ObsSocketFactory;
  return { socket, factory, transport: new ObsWebSocketTransport(factory, timeout) };
}

describe("OBS WebSocket v5 transport", () => {
  it("matches the official authentication example", () => {
    expect(createObsAuthentication(
      "supersecretpassword",
      "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=",
      "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=",
    )).toBe("1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
  });

  it("negotiates Hello, authentication, and Identified before connecting", async () => {
    const { socket, transport } = fixture();
    const connection = transport.connect({ url: "ws://127.0.0.1:4455", password: "supersecretpassword" });
    socket.emit("message", JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: {
      salt: "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=",
      challenge: "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=",
    } } }));
    expect(JSON.parse(socket.sent[0] ?? "{}")).toEqual({ op: 1, d: { rpcVersion: 1, authentication: "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=" } });
    socket.emit("message", JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    await expect(connection).resolves.toBeUndefined();
  });

  it("correlates successful and failed request responses", async () => {
    const { socket, transport } = fixture();
    const connection = transport.connect({ url: "ws://127.0.0.1:4455" });
    socket.emit("message", JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.emit("message", JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    await connection;

    const status = transport.request("GetRecordStatus");
    expect(JSON.parse(socket.sent.at(-1) ?? "{}")).toMatchObject({ op: 6, d: { requestType: "GetRecordStatus", requestId: "intentcut-1" } });
    socket.emit("message", JSON.stringify({ op: 7, d: { requestType: "GetRecordStatus", requestId: "intentcut-1", requestStatus: { result: true, code: 100 }, responseData: { outputActive: false } } }));
    await expect(status).resolves.toEqual({ outputActive: false });

    const start = transport.request("StartRecord");
    socket.emit("message", JSON.stringify({ op: 7, d: { requestType: "StartRecord", requestId: "intentcut-2", requestStatus: { result: false, code: 500, comment: "Output running" } } }));
    await expect(start).rejects.toThrow(/500.*Output running/);
  });

  it("refuses authentication-required servers when no password is supplied", async () => {
    const { socket, transport } = fixture();
    const connection = transport.connect({ url: "ws://127.0.0.1:4455" });
    socket.emit("message", JSON.stringify({ op: 0, d: { rpcVersion: 1, authentication: { salt: "salt", challenge: "challenge" } } }));
    await expect(connection).rejects.toThrow("requires authentication");
    expect(socket.closed).toBe(true);
  });

  it("rejects pending requests when OBS disconnects", async () => {
    const { socket, transport } = fixture();
    const connection = transport.connect({ url: "ws://127.0.0.1:4455" });
    socket.emit("message", JSON.stringify({ op: 0, d: { rpcVersion: 1 } }));
    socket.emit("message", JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    await connection;
    const request = transport.request("GetRecordStatus");
    socket.emit("close", 1006, Buffer.from("connection lost"));
    await expect(request).rejects.toThrow(/connection closed.*connection lost/);
  });
});
