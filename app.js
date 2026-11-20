
const videoInput = document.getElementById("videoInput");
const video = document.getElementById("videoPreview");

const trimStart = document.getElementById("trimStart");
const trimEnd = document.getElementById("trimEnd");

const ratio = document.getElementById("ratio");
const fitMode = document.getElementById("fitMode");
const resolution = document.getElementById("resolution");

const quality = document.getElementById("quality");
const qualityLabel = document.getElementById("qualityLabel");

const captionText = document.getElementById("captionText");
const captionPosition = document.getElementById("captionPosition");
const captionSize = document.getElementById("captionSize");
const captionColor = document.getElementById("captionColor");
const captionBackground = document.getElementById("captionBackground");
const captionPreview = document.getElementById("captionPreview");

const exportBtn = document.getElementById("exportBtn");
const stopBtn = document.getElementById("stopBtn");
const progress = document.getElementById("progress");
const status = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");
const videoInfo = document.getElementById("videoInfo");

const setStartBtn = document.getElementById("setStartBtn");
const setEndBtn = document.getElementById("setEndHere");

let originalFile = null;
let videoURL = null;
let recorder = null;
let chunks = [];
let exporting = false;
let exportStart = 0;
let exportEnd = 0;
let exportDuration = 0;
let renderCanvas = null;
let renderContext = null;
let animationFrame = null;
let exportTimer = null;
let outputURL = null;
let audioStream = null;
let canvasStream = null;

function setStatus(message) {
    status.textContent = message;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function revokeOutput() {
    if (outputURL) {
        URL.revokeObjectURL(outputURL);
        outputURL = null;
    }

    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
}

function revokeInput() {
    if (videoURL) {
        URL.revokeObjectURL(videoURL);
        videoURL = null;
    }
}

// IMPORT VIDEO

videoInput.addEventListener("change", () => {
    const file = videoInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        setStatus("Please select a video file.");
        return;
    }

    originalFile = file;

    revokeInput();
    revokeOutput();

    videoURL = URL.createObjectURL(file);
    video.src = videoURL;

    exportBtn.disabled = true;
    setStatus("Loading video...");
});

video.addEventListener("loadedmetadata", () => {
    if (!originalFile) return;

    trimStart.value = 0;
    trimEnd.value = video.duration;
    trimEnd.max = video.duration;

    videoInfo.textContent =
        `File: ${originalFile.name} | ` +
        `Size: ${(originalFile.size / 1024 / 1024).toFixed(2)} MB | ` +
        `Resolution: ${video.videoWidth} × ${video.videoHeight} | ` +
        `Duration: ${formatTime(video.duration)}`;

    exportBtn.disabled = false;
    setStatus("Video ready. Edit settings and export.");
});

// SET TRIM POINTS

setStartBtn.addEventListener("click", () => {
    trimStart.value = video.currentTime.toFixed(2);
});

setEndBtn.addEventListener("click", () => {
    trimEnd.value = video.currentTime.toFixed(2);
});

// CAPTION PREVIEW

function updateCaptionPreview() {
    const text = captionText.value.trim();

    captionPreview.textContent =
        text || "Caption preview will appear here";

    captionPreview.style.color = captionColor.value;

    captionPreview.style.fontSize =
        Math.min(Number(captionSize.value), 40) + "px";

    if (captionBackground.value === "box") {
        captionPreview.style.background = "#000";
    } else {
        captionPreview.style.background = "#293548";
    }
}

captionText.addEventListener("input", updateCaptionPreview);
captionPosition.addEventListener("change", updateCaptionPreview);
captionSize.addEventListener("input", updateCaptionPreview);
captionColor.addEventListener("input", updateCaptionPreview);
captionBackground.addEventListener("change", updateCaptionPreview);

// QUALITY

quality.addEventListener("input", () => {
    const labels = {
        1: "Very small file",
        2: "Small file",
        3: "Low quality",
        4: "Economical",
        5: "Balanced quality",
        6: "High quality",
        7: "Very high quality",
        8: "Maximum available quality"
    };

    qualityLabel.textContent = labels[quality.value];
});

updateCaptionPreview();

// ASPECT RATIO

function getAspectRatio() {
    switch (ratio.value) {
        case "16:9": return 16 / 9;
        case "9:16": return 9 / 16;
        case "1:1": return 1;
        case "4:5": return 4 / 5;
        default: return video.videoWidth / video.videoHeight;
    }
}

function calculateDimensions() {
    const aspect = getAspectRatio();
    const targetHeight = Number(resolution.value);

    let width = Math.round(targetHeight * aspect);
    let height = targetHeight;

    // Video encoder works best with even dimensions.
    width = Math.max(2, width - (width % 2));
    height = Math.max(2, height - (height % 2));

    return { width, height };
}

// DRAW CAPTION

function drawCaption(ctx, width, height) {
    const text = captionText.value.trim();

    if (!text) return;

    const fontSize = Math.max(
        18,
        Math.min(Number(captionSize.value), Math.floor(width / 12))
    );

    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const maxWidth = width * 0.88;
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine
            ? currentLine + " " + word
            : word;

        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.25;
    const padding = fontSize * 0.35;
    const totalHeight = lines.length * lineHeight;

    let y;

    switch (captionPosition.value) {
        case "top":
            y = height * 0.12 + totalHeight / 2;
            break;

        case "center":
            y = height / 2;
            break;

        default:
            y = height * 0.84 - totalHeight / 2;
    }

    if (captionBackground.value === "box") {
        const widest = Math.max(
            ...lines.map(line => ctx.measureText(line).width)
        );

        ctx.fillStyle = "rgba(0,0,0,0.72)";
        ctx.fillRect(
            width / 2 - widest / 2 - padding,
            y - totalHeight / 2 - padding,
            widest + padding * 2,
            totalHeight + padding * 2
        );
    }

    ctx.fillStyle = captionColor.value;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2, fontSize * 0.09);
    ctx.lineJoin = "round";

    lines.forEach((line, index) => {
        const lineY = y - totalHeight / 2 + lineHeight / 2
            + index * lineHeight;

        ctx.strokeText(line, width / 2, lineY, maxWidth);
        ctx.fillText(line, width / 2, lineY, maxWidth);
    });
}

// DRAW VIDEO TO CANVAS

function drawFrame() {
    if (!exporting || !renderContext || !renderCanvas) return;

    const width = renderCanvas.width;
    const height = renderCanvas.height;

    renderContext.fillStyle = "#000";
    renderContext.fillRect(0, 0, width, height);

    if (video.readyState >= 2) {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;

        const mode = fitMode.value;

        let drawWidth;
        let drawHeight;
        let dx;
        let dy;

        if (mode === "cover") {
            const scale = Math.max(
                width / sourceWidth,
                height / sourceHeight
            );

            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;

            dx = (width - drawWidth) / 2;
            dy = (height - drawHeight) / 2;
        } else {
            const scale = Math.min(
                width / sourceWidth,
                height / sourceHeight
            );

            drawWidth = sourceWidth * scale;
            drawHeight = sourceHeight * scale;

            dx = (width - drawWidth) / 2;
            dy = (height - drawHeight) / 2;
        }

        renderContext.drawImage(
            video,
            dx,
            dy,
            drawWidth,
            drawHeight
        );
    }

    drawCaption(renderContext, width, height);

    const elapsed = video.currentTime - exportStart;
    const percent = Math.max(
        0,
        Math.min(100, (elapsed / exportDuration) * 100)
    );

    progress.value = percent;

    animationFrame = requestAnimationFrame(drawFrame);
}

// AUDIO STREAM

function getAudioTracksFromVideo() {
    try {
        if (typeof video.captureStream === "function") {
            return video.captureStream().getAudioTracks();
        }

        if (typeof video.mozCaptureStream === "function") {
            return video.mozCaptureStream().getAudioTracks();
        }
    } catch (error) {
        console.warn("Audio capture unavailable", error);
    }

    return [];
}

// EXPORT

function getSupportedMimeType() {
    const types = [
        "video/mp4; codecs=avc1",
        "video/mp4",
        "video/webm; codecs=vp9",
        "video/webm; codecs=vp8",
        "video/webm"
    ];

    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
            return type;
        }
    }

    return "";
}

function getBitrate() {
    const bitrates = {
        1: 350000,
        2: 550000,
        3: 800000,
        4: 1200000,
        5: 2000000,
        6: 3500000,
        7: 5000000,
        8: 8000000
    };

    return bitrates[quality.value] || 2000000;
}

function cleanupStreams() {
    if (canvasStream) {
        canvasStream.getTracks().forEach(track => track.stop());
        canvasStream = null;
    }

    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    if (exportTimer) {
        clearTimeout(exportTimer);
        exportTimer = null;
    }
}

function finishExport() {
    if (!exporting) return;

    exporting = false;

    if (recorder && recorder.state !== "inactive") {
        recorder.stop();
    }

    video.pause();

    cleanupStreams();

    exportBtn.disabled = false;
    stopBtn.disabled = true;
}

exportBtn.addEventListener("click", async () => {
    if (!originalFile || exporting) return;

    if (!window.MediaRecorder) {
        setStatus("Your browser does not support video exporting.");
        return;
    }

    const start = Number(trimStart.value);
    const end = Number(trimEnd.value);

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end > video.duration ||
        end <= start
    ) {
        setStatus("Invalid trim settings. Check start and end time.");
        return;
    }

    revokeOutput();

    exportStart = start;
    exportEnd = end;
    exportDuration = end - start;

    const dimensions = calculateDimensions();

    renderCanvas = document.createElement("canvas");
    renderCanvas.width = dimensions.width;
    renderCanvas.height = dimensions.height;

    renderContext = renderCanvas.getContext("2d", {
        alpha: false
    });

    if (!renderContext) {
        setStatus("Could not create video rendering canvas.");
        return;
    }

    chunks = [];
    progress.value = 0;
    exporting = true;

    exportBtn.disabled = true;
    stopBtn.disabled = false;

    setStatus("Preparing video...");

    const mimeType = getSupportedMimeType();

    try {
        const options = {
            videoBitsPerSecond: getBitrate()
        };

        if (mimeType) {
            options.mimeType = mimeType;
        }

        recorder = new MediaRecorder(renderCanvas.captureStream(30), options);

        // Add audio tracks when browser supports local video capture.
        const audioTracks = getAudioTracksFromVideo();

        if (audioTracks.length > 0) {
            audioStream = new MediaStream(audioTracks);

            audioTracks.forEach(track => {
                try {
                    recorder.stream.addTrack(track);
                } catch (e) {
                    console.warn("Could not add audio track", e);
                }
            }
        }

        recorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        recorder.onerror = event => {
            console.error("Recorder error", event);
            setStatus("Export error. Try another browser.");
            finishExport();
        };

        recorder.onstop = () => {
            cleanupStreams();

            if (chunks.length === 0) {
                setStatus("No video was created. Try exporting again.");
                exportBtn.disabled = false;
                stopBtn.disabled = true;
                return;
            }

            const finalType = recorder.mimeType || mimeType || "video/webm";

            const blob = new Blob(chunks, {
                type: finalType
            });

            outputURL = URL.createObjectURL(blob);

            const extension = finalType.includes("mp4") ? "mp4" : "webm";

            downloadLink.href = outputURL;
            downloadLink.download = `clipforge_export.${extension}`;
            downloadLink.textContent = `⬇ DOWNLOAD VIDEO (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
            downloadLink.hidden = false;

            progress.value = 100;

            setStatus("Export complete! Your video is ready to save.");

            exportBtn.disabled = false;
            stopBtn.disabled = true;
        };

        recorder.start(250);

        video.pause();
        video.currentTime = exportStart;

        await new Promise(resolve => {
            const onSeek = () => {
                video.removeEventListener("seeked", onSeek);
                resolve();
            };

            video.addEventListener("seeked", onSeek, { once: true });

            // Fallback for browsers that don't emit seeked.
            setTimeout(() => {
                video.removeEventListener("seeked", onSeek);
                resolve();
            }, 1500);
        });

        setStatus("Rendering video...");

        drawFrame();

        await video.play();

        exportTimer = setInterval(() => {
            if (!exporting) return;

            if (video.currentTime >= exportEnd || video.ended) {
                finishExport();
            }
        }, 100);

    } catch (error) {
        console.error(error);

        setStatus("Export failed: " + error.message);

        finishExport();
        cleanupStreams();
        exportBtn.disabled = false;
        stopBtn.disabled = true;
    }
});

// STOP

stopBtn.addEventListener("click", () => {
    if (!exporting) return;

    setStatus("Export stopped.");

    finishExport();
});

// Reset output when settings change

[
    ratio,
    fitMode,
    resolution,
    quality,
    captionText,
    captionPosition,
    captionSize,
    captionColor,
    captionBackground,
    trimStart,
    trimEnd
].forEach(element => {
    element.addEventListener("change", revokeOutput);
});

window.addEventListener("beforeunload", () => {
    revokeInput();
    revokeOutput();
    cleanupStreams();
});
