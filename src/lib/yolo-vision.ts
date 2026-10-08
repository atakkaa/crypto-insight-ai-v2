// src/lib/yolo-vision.ts — YOLOv8 ONNX Runtime Web entegrasyonu
import * as ort from "onnxruntime-web";

// ONNX Runtime WASM dosyalarının konumu
ort.env.wasm.wasmPaths = "/ort/";

// Model sınıfları (Python'da aldığımız çıktıdan)
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
  0: "yükseliş",  // Ters OBO
  1: "düşüş",     // OBO
  2: "düşüş",     // M-Tepesi
  3: "nötr",      // Trend Çizgisi
  4: "nötr",      // Üçgen
  5: "yükseliş",  // W-Dibi
};

export type YoloDetection = {
  classId: number;
  className: string;
  classNameTr: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  confidence: number;
  // Bounding box koordinatları (0-1 arası normalize edilmiş)
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Piksel koordinatları (orijinal resim boyutunda)
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
};

let session: ort.InferenceSession | null = null;
let modelLoading = false;

/**
 * YOLOv8 modelini yükler (bir kere yüklenir, sonra cache'lenir)
 */
export async function loadYoloModel(): Promise<ort.InferenceSession | null> {
  if (session) return session;
  if (modelLoading) {
    // Model yükleniyorsa bekle
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
        executionProviders: ["wasm"], // CPU için (webgpu opsiyonel)
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
 * Canvas elementini 640x640 boyutunda resme çevirir
 */
export async function canvasToImageData(
  canvas: HTMLCanvasElement,
  targetSize = 640,
): Promise<{ tensor: ort.Tensor; originalWidth: number; originalHeight: number }> {
  const originalWidth = canvas.width;
  const originalHeight = canvas.height;

  // Canvas'ı geçici bir resme çevir
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = targetSize;
  tempCanvas.height = targetSize;
  const ctx = tempCanvas.getContext("2d");

  if (!ctx) throw new Error("Canvas context oluşturulamadı");

  // Siyah arka plan (grafikleri daha net görmek için)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, targetSize, targetSize);

  // Canvas'ı 640x640'a ölçekle
  ctx.drawImage(canvas, 0, 0, targetSize, targetSize);

  // ImageData al
  const imageData = ctx.getImageData(0, 0, targetSize, targetSize);

  // ImageData'yı Float32Array'e çevir (YOLOv8 formatı: [1, 3, 640, 640])
  const data = imageData.data;
  const float32Data = new Float32Array(3 * targetSize * targetSize);

  for (let i = 0; i < targetSize * targetSize; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;

    // Normalize: 0-255 → 0-1
    float32Data[i] = r / 255;                          // R kanalı
    float32Data[targetSize * targetSize + i] = g / 255; // G kanalı
    float32Data[2 * targetSize * targetSize + i] = b / 255; // B kanalı
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
 * YOLOv8 modelini canvas üzerinde çalıştırır
 */
export async function detectPatternsOnCanvas(
  canvas: HTMLCanvasElement,
  confidenceThreshold = 0.4,
): Promise<YoloDetection[]> {
  const model = await loadYoloModel();
  if (!model) return [];

  try {
    const { tensor, originalWidth, originalHeight } = await canvasToImageData(canvas);

    // Modeli çalıştır
    const feeds: Record<string, ort.Tensor> = {};
    feeds[model.inputNames[0] ?? "images"] = tensor;

    const results = await model.run(feeds);

    // Çıktıyı al (YOLOv8 çıktı: [1, 10, 8400])
    const output = results[model.outputNames[0] ?? "output0"];
    if (!output) return [];

    const outputData = output.data as Float32Array;
    const outputShape = output.dims; // [1, 10, 8400]

    const numClasses = YOLO_CLASSES ? Object.keys(YOLO_CLASSES).length : 6;
    const numBoxes = outputShape[2] ?? 8400;
    const numValuesPerBox = outputShape[1] ?? 10; // 4 (bbox) + 6 (sınıf)

    const detections: YoloDetection[] = [];

    for (let i = 0; i < numBoxes; i++) {
      // Sınıf skorlarını al (4. indeksten sonrası sınıf skorları)
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

      // Bounding box koordinatları (cx, cy, w, h formatında)
      const cx = outputData[0 * numBoxes + i] ?? 0;
      const cy = outputData[1 * numBoxes + i] ?? 0;
      const w = outputData[2 * numBoxes + i] ?? 0;
      const h = outputData[3 * numBoxes + i] ?? 0;

      // Normalize koordinatlar (0-1)
      const x1 = Math.max(0, cx - w / 2);
      const y1 = Math.max(0, cy - h / 2);
      const x2 = Math.min(1, cx + w / 2);
      const y2 = Math.min(1, cy + h / 2);

      detections.push({
        classId: maxClassId,
        className: YOLO_CLASSES[maxClassId] ?? "Bilinmeyen",
        classNameTr: YOLO_CLASSES_TR[maxClassId] ?? "Bilinmeyen",
        bias: YOLO_BIAS[maxClassId] ?? "nötr",
        confidence: maxClassScore,
        x1,
        y1,
        x2,
        y2,
        pixelX: x1 * originalWidth,
        pixelY: y1 * originalHeight,
        pixelWidth: (x2 - x1) * originalWidth,
        pixelHeight: (y2 - y1) * originalHeight,
      });
    }

    // Aynı sınıftan birden fazla varsa, en yüksek skoru tut (NMS benzeri basit filtre)
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

/**
 * Model hazır mı kontrolü
 */
export function isModelLoaded(): boolean {
  return session !== null;
}