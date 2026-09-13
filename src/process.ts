import { spawn } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
}
export interface BinaryProcessResult {
  stdout: Buffer;
  stderr: string;
}
export interface RunProcessOptions {
  onStderr?: (chunk: string) => void;
  encoding?: "utf8" | "buffer";
  /** Kill the process and reject after this many milliseconds. Default: no limit (renders can be long). */
  timeoutMilliseconds?: number;
}

export function runProcess(
  command: string,
  argumentsList: readonly string[],
  options: RunProcessOptions & { encoding: "buffer" },
): Promise<BinaryProcessResult>;
export function runProcess(
  command: string,
  argumentsList: readonly string[],
  options?: RunProcessOptions,
): Promise<ProcessResult>;
export function runProcess(
  command: string,
  argumentsList: readonly string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult | BinaryProcessResult> {
  return new Promise<ProcessResult | BinaryProcessResult>((resolve, reject) => {
    const child = spawn(command, argumentsList, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    let stdout = "";
    let stderr = "";

    if (options.encoding !== "buffer") child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string | Buffer) => {
      if (options.encoding === "buffer") stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      else stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });
    const timer = options.timeoutMilliseconds === undefined ? undefined : setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${options.timeoutMilliseconds}ms.`));
    }, options.timeoutMilliseconds);
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      if (options.encoding === "buffer") {
        resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
