// src/lib/yolo-vision.ts

export type YoloDetection = {
  className: string;
  classNameTr: string;
  bias: "yükseliş" | "düşüş" | "nötr";
  confidence: number;
  bbox?: [number, number, number, number];
};

let modelLoaded = false;

/**
 * YOLO modelini yükler (cache'lenir).
 * Şimdilik sadece bir flag set ediyor; gerçek model yükleme
 * kodunu buraya ekleyebilirsin (örn. onnxruntime-web veya tfjs).
 */
export async function loadYoloModel(): Promise<void> {
  if (modelLoaded) return;
  // TODO: gerçek model yükleme buraya
  // örnek: await ort.InferenceSession.create("/models/yolov8n.onnx");
  await new Promise((r) => setTimeout(r, 300)); // simülasyon
  modelLoaded = true;
}

/**
 * SVG elementindeki <image> veya çizimleri rasterize edip
 * YOLO çıkarımı yapar. (Basitleştirilmiş iskelet.)
 */
export async function detectPatternsOnSvg(
  svg: SVGSVGElement,
  confidenceThreshold = 0.4,
): Promise<YoloDetection[]> {
  // SVG'yi data URL'e çevir
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const svgBlob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.width || svg.clientWidth || 800;
    canvas.height = img.height || svg.clientHeight || 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context alınamadı");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // YOLO çıkarımı burada yapılır. Şimdilik sahte sonuç dönüyoruz.
    return runInference(canvas, confidenceThreshold);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Canvas elementindeki grafiği doğrudan YOLO'ya verir.
 * YoloPatternDetector bu fonksiyonu kullanıyor.
 */
export async function detectPatternsOnCanvas(
  canvas: HTMLCanvasElement,
  confidenceThreshold = 0.4,
): Promise<YoloDetection[]> {
  // Doğrudan canvas üzerinden çıkarım — SVG'ye çevirmeye gerek yok.
  return runInference(canvas, confidenceThreshold);
}

/* ---------------------- YARDIMCI FONKSİYONLAR ---------------------- */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Gerçek YOLO çıkarımı burada olacak.
 * Şu an placeholder olarak boş dizi dönüyor.
 */
async function runInference(
  _source: HTMLCanvasElement,
  _threshold: number,
): Promise<YoloDetection[]> {
  // TODO: ONNX / TFJS modelini burada çalıştır.
  // Örnek çıktı formatı:
  // return [
  //   {
  //     className: "head-and-shoulders",
  //     classNameTr: "Omuz-Baş-Omuz",
  //     bias: "düşüş",
  //     confidence: 0.87,
  //     bbox: [120, 80, 60, 40],
  //   },
  // ];
  return [];
}