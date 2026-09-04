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

## Verification boundary

Protocol behavior is tested through an injected WebSocket implementation. The
authority adapter is tested independently through a fake OBS transport.

On 2026-09-03, the production transport was also verified against OBS 32.2.2 on
localhost. It connected, observed an inactive recording state, started and
stopped a disposable blank-scene recording, returned the OBS output path, and
produced a valid 1.9-second MOV containing 1280×720 H.264 video at 30 fps and
AAC audio. A follow-up status request confirmed recording was inactive.

Authentication was restored immediately after the disposable test. A final
connection attempt without a password was refused. No OBS password was read,
printed, stored in the manifest, or committed.

There is intentionally no CLI command for live connection or recording yet.
That surface should be introduced only with explicit operator confirmation and
the same declared-take authority enforced by `ObsCaptureAdapter`.
