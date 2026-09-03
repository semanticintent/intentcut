import type { LoadedProject } from "./manifest.js";

export interface ObsConnectionOptions {
  url: string;
  password?: string;
}

export interface ObsRequestResult {
  [key: string]: unknown;
}

export interface ObsTransport {
  connect(options: ObsConnectionOptions): Promise<void>;
  request(requestType: string, requestData?: Record<string, unknown>): Promise<ObsRequestResult>;
  close(): Promise<void>;
}

export interface ObsRecordingReceipt {
  takeId: string;
  sceneId: string;
  expectedSource: string;
  outputPath: string;
  state: "captured-uningested";
}

export interface ObsAdapterStatus {
  connected: boolean;
  activeTakeId?: string;
  recording: boolean;
}

interface ActiveTake {
  id: string;
  sceneId: string;
  expectedSource: string;
}

export class ObsCaptureAdapter {
  private connected = false;
  private activeTake: ActiveTake | undefined;

  constructor(
    private readonly project: LoadedProject,
    private readonly transport: ObsTransport,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  async connect(): Promise<void> {
    const config = this.project.manifest.capture?.obs;
    if (!config?.enabled) throw new Error("OBS adapter is disabled. Set capture.obs.enabled: true explicitly.");
    const variable = config.passwordEnvironmentVariable;
    const password = variable ? this.environment[variable] : undefined;
    if (variable && !password) throw new Error(`OBS password environment variable ${variable} is not set.`);
    await this.transport.connect({ url: config.url, ...(password ? { password } : {}) });
    this.connected = true;
  }

  async status(): Promise<ObsAdapterStatus> {
    this.assertConnected();
    const response = await this.transport.request("GetRecordStatus");
    return {
      connected: true,
      recording: response.outputActive === true,
      ...(this.activeTake ? { activeTakeId: this.activeTake.id } : {}),
    };
  }

  async startTake(sceneId: string): Promise<void> {
    this.assertConnected();
    if (this.activeTake) throw new Error(`OBS take "${this.activeTake.id}" is already active.`);
    const take = this.project.manifest.capture?.takes.find((candidate) => candidate.scene === sceneId);
    if (!take) throw new Error(`No declared capture take exists for scene "${sceneId}".`);
    const scene = this.project.manifest.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene || scene.type !== "video") throw new Error(`Scene "${sceneId}" is not a recordable video scene.`);
    const status = await this.transport.request("GetRecordStatus");
    if (status.outputActive === true) throw new Error("OBS is already recording outside this IntentCut take.");
    await this.transport.request("StartRecord");
    this.activeTake = { id: `take-${sceneId}`, sceneId, expectedSource: scene.source };
  }

  async stopTake(): Promise<ObsRecordingReceipt> {
    this.assertConnected();
    if (!this.activeTake) throw new Error("No IntentCut OBS take is active.");
    const response = await this.transport.request("StopRecord");
    const outputPath = typeof response.outputPath === "string" ? response.outputPath : undefined;
    if (!outputPath) throw new Error("OBS stopped recording but did not return an output path.");
    const take = this.activeTake;
    this.activeTake = undefined;
    return {
      takeId: take.id,
      sceneId: take.sceneId,
      expectedSource: take.expectedSource,
      outputPath,
      state: "captured-uningested",
    };
  }

  async close(): Promise<void> {
    if (this.activeTake) throw new Error(`Cannot close OBS while take "${this.activeTake.id}" is active.`);
    if (this.connected) await this.transport.close();
    this.connected = false;
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error("OBS adapter is not connected.");
  }
}
