# IntentCut and OBS WebSocket

IntentCut implements the OBS WebSocket 5.x JSON protocol as a transport beneath
its capture-authority adapter.

Official protocol:
<https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md>

## Configuration

```yaml
capture:
  obs:
    enabled: true
    url: ws://127.0.0.1:4455
    passwordEnvironmentVariable: INTENTCUT_OBS_PASSWORD
```

The password value is never stored in the manifest. Inline password keys are
rejected by schema validation.

## TypeScript API

```ts
import {
  ObsCaptureAdapter,
  ObsWebSocketTransport,
  loadProject,
} from "@semanticintent/intentcut";

const project = await loadProject("intentcut.yaml");
const transport = new ObsWebSocketTransport();
const capture = new ObsCaptureAdapter(project, transport);

await capture.connect();
await capture.startTake("workspace");
const receipt = await capture.stopTake();
await capture.close();
```

These are intentionally separate operations. Connecting does not start a
recording. Stopping returns a `captured-uningested` receipt and does not move the
OBS output into the expected source path.

## Protocol behavior

The transport uses:

- the `obswebsocket.json` subprotocol;
- Hello, Identify, and Identified opcodes for connection setup;
- Node's built-in SHA-256 implementation for challenge authentication;
- Request and RequestResponse opcodes with correlated request identifiers;
- bounded handshake and request timeouts;
- rejection of all pending requests when the connection closes.

## Current verification boundary

Protocol behavior is tested through an injected WebSocket implementation. The
authority adapter is tested independently through a fake OBS transport. This
workstation does not currently have OBS installed, so no claim of a successful
live OBS connection or recording is made.

There is intentionally no CLI command for live connection or recording yet.
That surface should be introduced only with explicit operator confirmation and
a live OBS verification path.
