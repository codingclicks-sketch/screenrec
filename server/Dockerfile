# ── Stage 1: compile whisper.cpp + fetch the model ───────────────────────────
FROM node:20-bookworm AS whisper-build

RUN apt-get update && apt-get install -y --no-install-recommends \
      git build-essential cmake ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Pin a known-good release so deploys are reproducible.
ARG WHISPER_VERSION=v1.8.6
WORKDIR /opt
RUN git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggml-org/whisper.cpp.git

WORKDIR /opt/whisper.cpp
# Static link (BUILD_SHARED_LIBS=OFF) → a single self-contained whisper-cli
# binary, so the runtime image only needs libstdc++ / libgomp.
RUN cmake -B build \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_SHARED_LIBS=OFF \
      -DGGML_NATIVE=OFF \
      -DGGML_OPENMP=OFF \
      -DWHISPER_BUILD_TESTS=OFF \
      -DWHISPER_BUILD_EXAMPLES=ON \
    && cmake --build build -j --config Release --target whisper-cli

# Base English model (~142 MB): fast + accurate for screen-recording narration.
RUN mkdir -p /opt/models \
    && curl -fL -o /opt/models/ggml-base.en.bin \
       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

# ffmpeg = audio normalisation; libgomp1 = OpenMP runtime for whisper-cli.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# whisper binary + model from the build stage.
COPY --from=whisper-build /opt/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper-build /opt/models/ggml-base.en.bin /app/models/ggml-base.en.bin

ENV WHISPER_BIN=/usr/local/bin/whisper-cli \
    WHISPER_MODEL_PATH=/app/models/ggml-base.en.bin \
    NODE_ENV=production

EXPOSE 3001
CMD ["node", "index.js"]
