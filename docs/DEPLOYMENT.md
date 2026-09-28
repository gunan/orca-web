# Docker and TrueNAS SCALE

## Current status

The repository includes a web-server [Dockerfile](../Dockerfile) and [Compose configuration](../compose.yaml). The image builds the React application, serves it with Node, listens on port 3000 and keeps application data in `/data`.

**This is not yet a self-contained Linux slicer image.** The tested full application runs on macOS with OrcaSlicer 2.4.2 and the repository's native workers. In particular, `native/config-worker/scripts/build.py` currently stops on non-macOS platforms. That required helper resolves printer, process and filament settings. Copying the macOS binaries into a Linux container will not work.

The Docker packaging includes the frontend's public icons/assets and excludes native caches, local binaries, test results and diagnostic archives from its build context. A web-image build and HTTP smoke check are separate from Linux native slicing acceptance.

## Runtime requirements

For a functional Linux deployment, provide:

- A Linux OrcaSlicer 2.4.2 executable and its matching `resources` directory.
- A Linux build of `orca-config-worker`, with its paired `build-manifest.json`, from this repository's pinned native source.
- The dynamic libraries required by the slicer and workers, installed in the container. A read-only executable mount does not install its shared-library dependencies.
- The other workers for the corresponding implemented features: G-code preview, text/SVG, arrangement/clipboard, image processing and Prusa project conversion. Keep each worker with its matching manifest.

All executables and libraries must match the container's Linux architecture. The current image does not download OrcaSlicer, compile these workers or install their native dependencies automatically.

The Compose file expects a native-worker directory arranged as:

```text
workers/
  config/orca-config-worker
  config/build-manifest.json
  gcode/orca-gcode-worker
  emboss/orca-emboss-worker
  image/orca-image-worker
  prusa/orca-prusa-import
  arrange/orca-arrange-worker
  ... matching build-manifest.json files beside the other workers
```

The configuration worker is required. Missing optional workers leave their features unavailable.

## Build the web image

```sh
docker build -t orca-web:core-workflows-1 .
```

Once compatible Linux native artifacts and their libraries are available, set the host paths and start the supplied Compose service:

```sh
export ORCA_SLICER_BIN=/absolute/path/to/linux/OrcaSlicer
export ORCA_RESOURCES_DIR=/absolute/path/to/linux/resources
export ORCA_NATIVE_WORKERS_DIR=/absolute/path/to/linux/workers
docker compose up -d --build
```

The UI is at `http://HOST:3000`. `/api/health` must return HTTP 200 with the expected native engine and configuration helper available before treating the installation as usable. A page that loads while health returns 503 is not a working slicer installation. The named `orca-data` volume persists presets, jobs and application data.

## TrueNAS SCALE

TrueNAS 24.10 and later provide a Docker-based Apps backend. The official [Custom App documentation](https://www.truenas.com/docs/scale/apps/installcustomappscreens/) describes **Apps → Discover Apps → Install via YAML**, which accepts a Docker Compose document.

Once a complete Linux image has been built and validated, deployment there is straightforward:

1. Publish the image for the NAS architecture to a registry accessible to TrueNAS. No ready-to-run Orca Web registry image is published by this commit.
2. Create a dedicated dataset for application data. Map it to `/data`, with write access for the image's `node` user (UID/GID 1000).
3. In the Custom App YAML, use an `image:` reference to that image instead of `build: .`; the TrueNAS YAML editor does not contain this repository checkout.
4. Map an available NAS port to container port 3000. Supply the native executable/resources/worker mounts if those artifacts are not bundled in the image, using real `/mnt/POOL/...` host paths rather than local Mac paths or shell variables.
5. Confirm native health, create a printer, select a filament, load an STL and download real G-code. The current macOS acceptance run is not a substitute for this Linux test.

The remaining prerequisite is the Linux native-runtime build and validation, so the current version is **not yet an easy complete TrueNAS deployment**. The web container packaging alone does not close that gap. The app currently has no built-in authentication; keep access on the private network or use an authenticated reverse proxy.

## Validation recorded for this version

- Local `linux/arm64` web image: `docker build -t orca-web:core-workflows-1 .` passed. [Build log](parity/DOCKER_WEB_BUILD_CORE1.log).
- Container HTTP smoke: server startup, HTML, compiled JavaScript, icon manifest and PNG asset passed as UID/GID 1000. With no native bundle supplied, `/api/health` correctly returned 503. [Smoke result](parity/DOCKER_WEB_SMOKE_CORE1.log).
- `docker-compose config --quiet`, with all three required mount variables supplied, passed. This host provides Compose as the standalone `docker-compose` command.
- Linux native slicing, an amd64 native bundle and deployment on a TrueNAS host have not been validated.

The existing application acceptance remains 1,140 unit/API, 405 mock-browser and 91 installed-native browser tests on the tested macOS setup. See [core workflow acceptance](parity/CORE_WORKFLOWS_1.md).
