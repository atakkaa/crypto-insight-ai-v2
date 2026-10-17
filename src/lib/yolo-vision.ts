// src/lib/yolo-vision.ts

export const YOLO_CLASS_NAMES = [
  "Üçgen", "Çift Tepe", "Çift Dip", "Yükselen Kanal", "Düşen Kanal",
  "OBO", "TOBO", "Çanak", "Çanak-Kulp", "Yükselen Takoz",
  "Alçalan Takoz", "Flama", "Elmas"
];

// CandleChart.tsx'in beklediği TÜM özellikleri buraya ekledik
export interface YoloDetection {
  classId: number;
  className: string;
  classNameTr: string;
  confidence: number;
  box: number[];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bias: "yükseliş" | "düşüş" | "nötr";
}

let session: any = null;

export async function loadYoloModel() {
  if (session) return session;
  console.log("⏳ YOLO Modeli yükleniyor...");
  try {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1; 
    session = await ort.InferenceSession.create("/models/best.onnx", {
      executionProviders: ["wasm"], 
    });
    console.log("✅ YOLO Modeli başarıyla yüklendi ve hazır!");
    return session;
  } catch (error) {
    console.error("❌ YOLO modeli yüklenirken hata oluştu:", error);
    throw error;
  }
}

export async function predictWithYolo(imageBase64: string): Promise<YoloDetection[]> {
  const currentSession = await loadYoloModel();
  const ort = await import("onnxruntime-web");

  const img = new Image();
  img.src = imageBase64;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 640;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context oluşturulamadı");
  ctx.drawImage(img, 0, 0, 640, 640);

  const imageData = ctx.getImageData(0, 0, 640, 640);
  const data = imageData.data;
  const float32Data = new Float32Array(1 * 3 * 640 * 640);
  
  for (let i = 0; i < 640 * 640; i++) {
    float32Data[i] = (data[i * 4] || 0) / 255.0;                 
    float32Data[640 * 640 + i] = (data[i * 4 + 1] || 0) / 255.0; 
    float32Data[2 * 640 * 640 + i] = (data[i * 4 + 2] || 0) / 255.0; 
  }

  const tensor = new ort.Tensor("float32", float32Data, [1, 3, 640, 640]);
  const feeds: Record<string, any> = {};
  feeds[currentSession.inputNames[0]] = tensor;

  const results = await currentSession.run(feeds);
  const output = results[currentSession.outputNames[0]]; 
  const outputData = output.data as Float32Array;
  const numClasses = YOLO_CLASS_NAMES.length; 
  const numAnchors = 8400; 

  const predictions: YoloDetection[] = [];

  for (let i = 0; i < numAnchors; i++) {
    let maxScore = 0;
    let maxClassId = -1;

    for (let c = 0; c < numClasses; c++) {
      const score = outputData[4 * numAnchors + c * numAnchors + i] || 0;
      if (score > maxScore) {
        maxScore = score;
        maxClassId = c;
      }
    }

    if (maxScore > 0.45 && maxClassId !== -1) {
      const x = outputData[0 * numAnchors + i] || 0;
      const y = outputData[1 * numAnchors + i] || 0;
      const w = outputData[2 * numAnchors + i] || 0;
      const h = outputData[3 * numAnchors + i] || 0;

      const cName = YOLO_CLASS_NAMES[maxClassId] || "Bilinmeyen";
      
      let bias: "yükseliş" | "düşüş" | "nötr" = "nötr";
      if (cName.includes("Dip") || cName.includes("Alçalan Takoz") || cName.includes("TOBO") || cName.includes("Çanak")) bias = "yükseliş";
      if (cName.includes("Tepe") || cName.includes("Yükselen Takoz") || cName.includes("OBO")) bias = "düşüş";

      predictions.push({
        classId: maxClassId,
        className: cName,
        classNameTr: cName, // CandleChart için Türkçe isim eklendi
        confidence: maxScore,
        box: [x, y, w, h],
        x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2, // Koordinatlar eklendi
        bias: bias
      });
    }
  }

  if (predictions.length > 0) {
     // En yüksek skorlu olanı başa al ve döndür
     const sorted = predictions.sort((a, b) => b.confidence - a.confidence);
     return sorted.length > 0 && sorted[0] ? [sorted[0]] : [];
  }

  return [];
}

// CandleChart.tsx için SVG'den tahmin köprüsü
export async function detectPatternsOnSvg(svgElement: SVGSVGElement): Promise<YoloDetection[]> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    ctx.drawImage(img, 0, 0, 640, 640);
    URL.revokeObjectURL(url);

    const base64 = canvas.toDataURL("image/png");
    const predictions = await predictWithYolo(base64);
    
    return predictions; // Zaten formatlandırılmış olarak dönüyor
  } catch (error) {
    console.error("SVG'den YOLO tahmini yapılırken hata:", error);
    return [];
  }
}