// src/lib/yolo-vision.ts — YOLOv8 ONNX Runtime Web entegrasyonu
import * as ort from "onnxruntime-web";

// ONNX Runtime WASM dosyalarının konumu
ort.env.wasm.wasmPaths = "/ort/";

// Model sınıfları (Python çıktısından)
export const YOLO_CLASSES: Record<number, string> = {
  0: "Head and shoulders bottom",
  1: "Head and shoulders top",
  2: "M_Head",
  3: "StockLine",
  4: "Triangle",
  5: "W_Bottom",
};

// Türkçe formasyon isimleri
export const YOLO_CLASSES_TR: Record<number, string> = {
  0: "Ters Omuz-Baş-Omuz",
  1: "Omuz-Baş-Omuz",
  2: "M-Tepesi (Çift Tepe)",
  3: "Trend Çizgisi",
  4: "Üçgen",
  5: "W-Dibi (Çift Dip)",
};

// Formasyon yönleri
export const YOLO_BIAS: Record<number, "yükseliş" | "düşüş" | "nötr"> = {
  0: "yükseliş",
  1: "düşüş",
  2: "düşüş",
  3: "nötr",
  4: "nötr",
  5: "yükseliş",
};

export type YoloDetection = {
  classId: number;
  className: string;
  classNameTr: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

let session: ort.InferenceSession | null = null;
let modelLoading = false;

export async function loadYoloModel(): Promise<ort.InferenceSession | null> {
  if (session) return session;

  if (modelLoading) {
    while (modelLoading) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return session;
  }

  modelLoading = true;
  try {
    console.log("🤖 YOLOv8 modeli yükleniyor...");
    const startTime = Date.now();

    session = await ort.InferenceSession.create(
      "/models/model_quantized.onnx",
      {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      },
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ YOLOv8 modeli yüklendi (${elapsed}s)`);
    return session;
  } catch (error) {
    console.error("❌ Model yüklenemedi:", error);
    return null;
  } finally {
    modelLoading = false;
  }
}

/**
 * SVG elementini resme çevirip YOLOv8 için tensor oluşturur
 */
export async function svgToTensor(
  svgElement: SVGSVGElement,
  targetSize = 640,
): Promise<{ tensor: ort.Tensor; originalWidth: number; originalHeight: number }> {
  const viewBox = svgElement.viewBox.baseVal;
  const originalWidth = viewBox.width || svgElement.clientWidth || 1000;
  const originalHeight = viewBox.height || svgElement.clientHeight || 420;

  const svgString = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = targetSize;
  tempCanvas.height = targetSize;
  const ctx = tempCanvas.getContext("2d");

  if (!ctx) throw new Error("Canvas context oluşturulamadı");

  // Beyaz arka plan
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetSize, targetSize);

  const img = new Image();
  img.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG yüklenemedi"));
    img.src = url;
  });

  ctx.drawImage(img, 0, 0, targetSize, targetSize);
  URL.revokeObjectURL(url);

  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
  const data = imageData.data;

  const float32Data = new Float32Array(3 * targetSize * targetSize);

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;

    float32Data[i] = r / 255;
    float32Data[targetSize * targetSize + i] = g / 255;
    float32Data[2 * targetSize * targetSize + i] = b / 255;
  }

  const tensor = new ort.Tensor("float32", float32Data, [
    1,
    3,
    targetSize,
    targetSize,
  ]);

  return { tensor, originalWidth, originalHeight };
}

/**
 * SVG üzerinde YOLOv8 formasyon tespiti yapar
 */
export async function detectPatternsOnSvg(
  svgElement: SVGSVGElement,
  confidenceThreshold = 0.4,
): Promise<YoloDetection[]> {
  const model = await loadYoloModel();
  if (!model) return [];

  try {
    const { tensor } = await svgToTensor(svgElement);

    const feeds: Record<string, ort.Tensor> = {};
    feeds[model.inputNames[0] ?? "images"] = tensor;

    const results = await model.run(feeds);

    const output = results[model.outputNames[0] ?? "output0"];
    if (!output) return [];

    const outputData = output.data as Float32Array;
    const outputShape = output.dims;

    const numClasses = Object.keys(YOLO_CLASSES).length;
    const numBoxes = outputShape[2] ?? 8400;

    const detections: YoloDetection[] = [];

    for (let i = 0; i < numBoxes; i++) {
      let maxClassScore = 0;
      let maxClassId = -1;

      for (let c = 0; c < numClasses; c++) {
        const scoreIndex = (4 + c) * numBoxes + i;
        const score = outputData[scoreIndex] ?? 0;
        if (score > maxClassScore) {
          maxClassScore = score;
          maxClassId = c;
        }
      }

      if (maxClassScore < confidenceThreshold || maxClassId === -1) continue;

      const cx = outputData[0 * numBoxes + i] ?? 0;
      const cy = outputData[1 * numBoxes + i] ?? 0;
      const w = outputData[2 * numBoxes + i] ?? 0;
      const h = outputData[3 * numBoxes + i] ?? 0;

      detections.push({
        classId: maxClassId,
        className: YOLO_CLASSES[maxClassId] ?? "Bilinmeyen",
        classNameTr: YOLO_CLASSES_TR[maxClassId] ?? "Bilinmeyen",
        bias: YOLO_BIAS[maxClassId] ?? "nötr",
        confidence: maxClassScore,
        x1: Math.max(0, cx - w / 2),
        y1: Math.max(0, cy - h / 2),
        x2: Math.min(1, cx + w / 2),
        y2: Math.min(1, cy + h / 2),
      });
    }

    const bestByClass = new Map<number, YoloDetection>();
    for (const det of detections) {
      const existing = bestByClass.get(det.classId);
      if (!existing || det.confidence > existing.confidence) {
        bestByClass.set(det.classId, det);
      }
    }

    return Array.from(bestByClass.values()).sort(
      (a, b) => b.confidence - a.confidence,
    );
  } catch (error) {
    console.error("YOLO inference hatası:", error);
    return [];
  }
}

export function isModelLoaded(): boolean {
  return session !== null;
}