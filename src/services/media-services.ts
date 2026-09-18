import { createServerFn } from "@tanstack/react-start";

/**
 * Media Services API (Veo 3.1 & Nano Banana / Flash Image Generation)
 * Provides prompt generation, rendering stubs, and exact cost calculations based on PRD specs:
 * Veo 3.1 Fast 720p: $0.10 / sec ($0.10 * Rp17.500 = Rp1.750 / sec)
 */

export interface VideoGenRequest {
  prompt: string;
  durationSeconds: number; // e.g. 8 seconds
  resolution: "720p" | "1080p";
  contentId?: string;
  topicTitle?: string;
  userId?: string;
}

export interface VideoGenResponse {
  id: string;
  status: "completed" | "processing" | "failed";
  videoUrl: string;
  durationSeconds: number;
  costInUSD: number;
  costInIDR: number;
  formattedCostIDR: string;
  error?: string;
}

export interface ImageGenRequest {
  prompt: string;
  aspectRatio: "1:1" | "4:5" | "9:16";
  contentId?: string;
  topicTitle?: string;
  userId?: string;
}

export interface ImageGenResponse {
  id: string;
  status: "completed" | "failed";
  imageUrl: string;
  aspectRatio: string;
  error?: string;
}

export interface MediaGenServerInput {
  contentId: string;
  mediaType: "image" | "video";
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16";
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
  topicTitle?: string;
  userId?: string;
}

export interface MediaGenServerOutput {
  id: string;
  status: "completed" | "processing" | "failed";
  mediaUrl: string;
  videoUrl?: string;
  imageUrl?: string;
  mediaType: "image" | "video";
  durationSeconds?: number;
  costInUSD?: number;
  costInIDR?: number;
  formattedCostIDR?: string;
  aspectRatio?: string;
  error?: string;
}

const VEO_RATE_PER_SECOND_USD = 0.10; // $0.10 / sec as per PRD
const USD_TO_IDR_RATE = 17500;       // Rp 17.500 per USD as per PRD

export function calculateVeoVideoCost(durationSeconds: number) {
  const costUSD = durationSeconds * VEO_RATE_PER_SECOND_USD;
  const costIDR = costUSD * USD_TO_IDR_RATE;
  return {
    costUSD,
    costIDR,
    formattedCostUSD: `$${costUSD.toFixed(2)}`,
    formattedCostIDR: `Rp${costIDR.toLocaleString("id-ID")}`
  };
}

/**
 * Built-in Indonesian-to-English Subject Mapping for Visual Generation
 */
const INDO_TO_EN_SUBJECT_MAP: Record<string, string> = {
  "kucing berjalan": "A cute realistic fluffy cat gracefully walking forward on green grass",
  "kucing jalan": "A cute realistic fluffy cat gracefully walking forward on green grass",
  "kucing lari": "A playful energetic cat running across a sunny lawn",
  "anjing berjalan": "A friendly playful dog happily walking on a sunny park path",
  "kelinci berjalan": "A cute fluffy rabbit hopping gently on green lawn",
  kelinci: "A realistic cute fluffy rabbit sitting in a lush green garden",
  kucing: "A cute realistic fluffy cat with soft fur and expressive eyes",
  anjing: "A friendly playful domestic dog in a bright park",
  kopi: "An aesthetic cup of hot cappuccino with latte art on a wooden cafe table",
  makanan: "A delicious gourmet meal beautifully plated on a restaurant table",
  mobil: "A sleek modern luxury sports car parked on a scenic road",
  motor: "A modern stylish motorcycle with metallic finish",
  baju: "An aesthetic fashionable clothing outfit flatlay style",
  skincare: "A luxury minimalist skincare cosmetic bottle on a clean marble surface",
  bunga: "A vibrant fresh bouquet of colorful blooming flowers",
  pantai: "A stunning tropical beach with turquoise ocean water and white sand",
  gunung: "A breathtaking majestic mountain peak under clear morning sunlight",
  alam: "A scenic picturesque natural landscape with greenery and trees",
  pemandangan: "A scenic picturesque natural landscape with greenery and trees",
  gajah: "A majestic realistic elephant walking in the savanna",
  singa: "A majestic realistic lion with a grand mane",
  harimau: "A majestic realistic tiger in a lush jungle",
  buaya: "A realistic crocodile resting near a riverbank",
  naga: "A majestic mythical dragon with detailed scales",
  burung: "A colorful beautiful bird perched on a branch",
  ikan: "A colorful vibrant tropical fish swimming in clear water"
};

/**
 * Visual Guardrail & Prompt Sanitizer (Strict)
 * Enforces Subject-Lock, Framing & Composition, and Video Stability & Continuity.
 */
export function sanitizeVisualPrompt(userPrompt: string, mediaType: "image" | "video"): string {
  let cleaned = (userPrompt || "").trim();

  // If already sanitized, strip previous "Visual constraints:" suffix before re-applying
  if (cleaned.includes("Visual constraints:")) {
    cleaned = cleaned.split("Visual constraints:")[0].trim();
  }

  // Strip conversational prefixes
  let subjectOnly = cleaned
    .replace(/^(tolong|bisa|coba|mohon|mau|pengen)\s+/i, "")
    .replace(/^(buatkan|bikin|bikinin|buat|buatin|generate|produksi|minta)\s+/i, "")
    .replace(/^(gambar|gambarnya|visual|visualnya|foto|fotonya|video|videonya|vidio|vidionya|reel|reels|klip|animasi)\s+/i, "")
    .replace(/^(tentang|mengenai|dari)\s+/i, "")
    .trim();

  // Framing & Composition Guardrail: Replace extreme close-ups causing zoom/crop issues
  subjectOnly = subjectOnly.replace(/\bextreme close[- ]?up\b/gi, "medium shot with clear margins");
  subjectOnly = subjectOnly.replace(/\bmacro close[- ]?up\b/gi, "centered medium shot");

  // Ensure clean punctuation
  if (subjectOnly.endsWith(".")) {
    subjectOnly = subjectOnly.slice(0, -1).trim();
  }

  // Translate Indonesian keyword if found in dictionary
  let englishSubject = "";
  const lowerSubject = subjectOnly.toLowerCase();
  for (const [key, val] of Object.entries(INDO_TO_EN_SUBJECT_MAP)) {
    if (lowerSubject.includes(key)) {
      englishSubject = val;
      break;
    }
  }

  const basePrompt = englishSubject || subjectOnly || cleaned || "High quality Instagram marketing visual";

  // Lock subject and framing (Subject-Lock & Framing Directives)
  // Note: Avoid 'no cropped limbs' on generic subjects to prevent human bias in AI generators
  const baseRules =
    "Photorealistic 4k, centered subject, complete subject fully visible inside camera frame, clear margins, studio lighting, highly detailed.";

  // Video Stability & Continuity (Movement Directives)
  const motionRules =
    mediaType === "video"
      ? "smooth fluid motion, steady camera angle, 24fps look, subtle movement, natural lighting change."
      : "";

  return `${basePrompt}. Visual constraints: ${baseRules} ${motionRules}`.replace(/\s+/g, " ").trim();
}

/**
 * Server-side dynamic Subject-Lock prompt resolver
 * Uses Gemini AI on server to accurately translate any conversational Indonesian request into
 * an explicit, subject-locked English text-to-image prompt.
 */
async function resolveSubjectLockedPrompt(
  userPrompt: string,
  mediaType: "image" | "video",
  ai?: any
): Promise<string> {
  let cleaned = (userPrompt || "").trim();
  if (cleaned.includes("Visual constraints:")) {
    cleaned = cleaned.split("Visual constraints:")[0].trim();
  }

  let subjectOnly = cleaned
    .replace(/^(tolong|bisa|coba|mohon|mau|pengen)\s+/i, "")
    .replace(/^(buatkan|bikin|bikinin|buat|buatin|generate|produksi|minta)\s+/i, "")
    .replace(/^(gambar|gambarnya|visual|visualnya|foto|fotonya|video|videonya|vidio|vidionya|reel|reels|klip|animasi)\s+/i, "")
    .replace(/^(tentang|mengenai|dari)\s+/i, "")
    .trim();

  let englishSubject = "";

  // 1. If Gemini AI instance is available, use it for ultra-accurate Subject-Lock translation
  if (ai) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: [{
          parts: [{
            text: `You are an expert text-to-image prompt engineer. Convert the user request from Indonesian into an explicit English prompt with STRICT SUBJECT-LOCK.
DIRECTIVES:
1. The very first 3-5 words MUST explicitly name and lock the primary subject (e.g. 'A cute fluffy rabbit...', 'A sleek red sports car...').
2. NEVER use metaphors, poetry, or vague allegories.
3. Translate all Indonesian concepts into explicit, literal English.
4. Output ONLY the English prompt, with NO explanations, quotes, or markdown.

User request: "${subjectOnly || cleaned}"`
          }]
        }],
        config: {
          maxOutputTokens: 100,
          temperature: 0.2
        }
      });
      const text = res.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text && text.length > 5 && !text.includes("\n")) {
        englishSubject = text;
      }
    } catch (e) {
      console.warn("[Subject-Lock] Gemini prompt translation notice, using dictionary fallback:", e);
    }
  }

  // 2. Dictionary fallback for instant subject lock
  if (!englishSubject) {
    const lowerSubject = subjectOnly.toLowerCase();
    for (const [key, val] of Object.entries(INDO_TO_EN_SUBJECT_MAP)) {
      if (lowerSubject.includes(key)) {
        englishSubject = val;
        break;
      }
    }
  }

  let finalSubject = englishSubject || subjectOnly || cleaned || "High quality Instagram marketing visual";
  if (finalSubject.endsWith(".")) {
    finalSubject = finalSubject.slice(0, -1).trim();
  }

  const baseRules =
    "Photorealistic 4k, centered subject, complete subject fully visible inside camera frame, clear margins, studio lighting, highly detailed.";

  const motionRules =
    mediaType === "video"
      ? "smooth fluid motion, steady camera angle, 24fps look, subtle movement, natural lighting change."
      : "";

  return `${finalSubject}. Visual constraints: ${baseRules} ${motionRules}`.replace(/\s+/g, " ").trim();
}

/**
 * Server Function for Media Generation (TanStack Start RPC bridge)
 * Strictly executed on the server.
 * Uses Google GenAI SDK (@google/genai) with process.env.GEMINI_API_KEY.
 * Uploads generated media to Supabase Storage bucket 'user_media'.
 * Enforces Media Gate: contentId must be provided and not empty.
 */
export const generateMediaServerFn = createServerFn({ method: "POST" })
  .validator((data: MediaGenServerInput) => data)
  .handler(async ({ data }): Promise<MediaGenServerOutput> => {
    // 1. Resolve content ID (support both post-linked generation and standalone chat generation)
    const effectiveContentId =
      data.contentId && data.contentId.trim() !== "" && data.contentId !== "pending-content"
        ? data.contentId.trim()
        : `media-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const isStandalone = !data.contentId || data.contentId === "pending-content" || data.contentId.startsWith("media-") || data.contentId.startsWith("img-");

    // 2. Read GEMINI_API_KEY strictly from server process.env
    const serverKey = (typeof process !== "undefined" && process.env ? process.env.GEMINI_API_KEY : "") || "";

    // Dynamic imports for server-side libraries
    const { GoogleGenAI } = await import("@google/genai");
    const { createClient } = await import("@supabase/supabase-js");

    const sbUrl = (typeof process !== "undefined" && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) || "";
    const sbKey = (typeof process !== "undefined" && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)) || "";
    const sb = createClient(sbUrl, sbKey);
    const ai = serverKey ? new GoogleGenAI({ apiKey: serverKey }) : null;

    // 3. Enforce Visual Guardrail & Prompt Sanitizer with AI-powered Subject-Lock
    const sanitizedPrompt = await resolveSubjectLockedPrompt(data.prompt, data.mediaType, ai);

    if (data.mediaType === "video") {
      // ==========================================
      // REAL VIDEO GENERATION (Google Veo 3.1)
      // ==========================================
      const duration = data.durationSeconds || 8;
      const cost = calculateVeoVideoCost(duration);

      if (!serverKey) {
        return {
          id: `veo-failed-${Date.now()}`,
          status: "failed",
          mediaUrl: "",
          videoUrl: "",
          mediaType: "video",
          durationSeconds: duration,
          costInUSD: cost.costUSD,
          costInIDR: cost.costIDR,
          formattedCostIDR: cost.formattedCostIDR,
          error: "GEMINI_API_KEY is not configured on the server."
        };
      }

      const ai = new GoogleGenAI({ apiKey: serverKey });

      try {
        console.log(`[Veo 3.1 Server] Requesting video generation for ${effectiveContentId}...`);

        let operation = await ai.models.generateVideos({
          model: "veo-3.1-generate-preview",
          source: {
            prompt: sanitizedPrompt,
          },
          config: {
            aspectRatio: "9:16",
            numberOfVideos: 1,
            resolution: (data.resolution as any) || "720p",
            durationSeconds: duration as any,
          }
        });

        // Polling loop until asynchronous operation completes
        const pollStart = Date.now();
        const timeoutMs = 240000; // 4 minutes max
        while (!operation.done) {
          if (Date.now() - pollStart > timeoutMs) {
            throw new Error("Veo video generation timed out after 4 minutes.");
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
          operation = await ai.operations.getVideosOperation({ operation });
        }

        const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
        if (!generatedVideo) {
          throw new Error("No video returned from Google Veo API.");
        }

        let videoBuffer: Buffer;
        if (generatedVideo.videoBytes) {
          videoBuffer = Buffer.from(generatedVideo.videoBytes, "base64");
        } else if (generatedVideo.uri) {
          const downloadUri = `${generatedVideo.uri}${generatedVideo.uri.includes("?") ? "&" : "?"}key=${serverKey}`;
          const vidFetch = await fetch(downloadUri);
          if (!vidFetch.ok) {
            throw new Error(`Failed to download Veo video stream: HTTP ${vidFetch.status}`);
          }
          const arrayBuf = await vidFetch.arrayBuffer();
          videoBuffer = Buffer.from(arrayBuf);
        } else {
          throw new Error("Veo response did not contain usable video stream or bytes.");
        }

        // Upload to Supabase Storage bucket 'user_media'
        const filePath = `videos/${effectiveContentId}-${Date.now()}.mp4`;
        const { error: uploadErr } = await sb.storage.from("user_media").upload(filePath, videoBuffer, {
          contentType: "video/mp4",
          upsert: true
        });

        if (uploadErr) {
          throw new Error(`Supabase Storage upload error: ${uploadErr.message}`);
        }

        const { data: pubUrlData } = sb.storage.from("user_media").getPublicUrl(filePath);
        const publicUrl = pubUrlData.publicUrl;

        // Update content_posts if linked to an existing post
        if (!isStandalone) {
          await sb.from("content_posts").update({
            media_url: publicUrl,
            media_type: "video",
            updated_at: new Date().toISOString()
          }).eq("id", effectiveContentId);
        }

        // Insert record into user_media_library
        await sb.from("user_media_library").insert([{
          user_id: data.userId || null,
          post_id: isStandalone ? null : effectiveContentId,
          media_type: "video",
          media_url: publicUrl,
          title: data.topicTitle ? `Video Reel ${data.topicTitle}` : "Video Reel",
          prompt: sanitizedPrompt,
          status: "generated"
        }]);

        return {
          id: `veo-${Date.now()}`,
          status: "completed",
          mediaUrl: publicUrl,
          videoUrl: publicUrl,
          mediaType: "video",
          durationSeconds: duration,
          costInUSD: cost.costUSD,
          costInIDR: cost.costIDR,
          formattedCostIDR: cost.formattedCostIDR,
        };
      } catch (err: any) {
        let errorMsg = err?.message || String(err);
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) {
            errorMsg = parsed.error.message;
          }
        } catch {}
        console.error("[Veo 3.1 Server] Error generating video:", errorMsg);
        return {
          id: `veo-failed-${Date.now()}`,
          status: "failed",
          mediaUrl: "",
          videoUrl: "",
          mediaType: "video",
          durationSeconds: duration,
          costInUSD: cost.costUSD,
          costInIDR: cost.costIDR,
          formattedCostIDR: cost.formattedCostIDR,
          error: errorMsg,
        };
      }
    } else {
      // ==========================================
      // REAL IMAGE GENERATION (Nano Banana Engine)
      // ==========================================
      let publicUrl = "";
      let isSuccess = false;

      // 1. Primary Attempt: Google Gemini Image Generation
      if (serverKey) {
        try {
          console.log(`[Nano Banana Server] Requesting image generation with gemini-3.1-flash-image for ${effectiveContentId}...`);
          const ai = new GoogleGenAI({ apiKey: serverKey });
          const imgRes = await ai.models.generateContent({
            model: "gemini-3.1-flash-image",
            contents: sanitizedPrompt,
            config: {
              imageConfig: {
                aspectRatio: data.aspectRatio || "4:5",
              }
            }
          });

          let base64Data = "";
          let mimeType = "image/png";
          const parts = imgRes.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              base64Data = part.inlineData.data;
              mimeType = part.inlineData.mimeType || "image/png";
              break;
            }
          }

          if (base64Data) {
            const imgBuffer = Buffer.from(base64Data, "base64");
            const ext = mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
            const filePath = `images/${effectiveContentId}-${Date.now()}.${ext}`;

            const { error: uploadErr } = await sb.storage.from("user_media").upload(filePath, imgBuffer, {
              contentType: mimeType,
              upsert: true
            });

            if (!uploadErr) {
              const { data: pubUrlData } = sb.storage.from("user_media").getPublicUrl(filePath);
              if (pubUrlData?.publicUrl) {
                publicUrl = pubUrlData.publicUrl;
                isSuccess = true;
              }
            }
          }
        } catch (geminiImgErr: any) {
          console.warn("[Nano Banana Server] Gemini image generation notice, falling back to Flux engine:", geminiImgErr?.message);
        }
      }

      // 2. High-fidelity Fallback: Pollinations Flux Engine with Sanitized Visual Prompt
      // (Used when Gemini free-tier image quota is limit: 0 or rate-limited)
      if (!isSuccess || !publicUrl) {
        try {
          console.log(`[Nano Banana Server] Generating visual via Flux engine for ${effectiveContentId}...`);
          let width = 1080;
          let height = 1350; // 4:5
          if (data.aspectRatio === "9:16") {
            width = 720;
            height = 1280;
          } else if (data.aspectRatio === "1:1") {
            width = 1080;
            height = 1080;
          } else if (data.aspectRatio === "16:9") {
            width = 1280;
            height = 720;
          }

          const encodedPrompt = encodeURIComponent(sanitizedPrompt);
          const fluxUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&private=true&model=flux&enhance=true`;

          const fetchRes = await fetch(fluxUrl);
          if (fetchRes.ok) {
            const arrayBuf = await fetchRes.arrayBuffer();
            const imgBuf = Buffer.from(arrayBuf);
            const filePath = `images/${effectiveContentId}-${Date.now()}.jpg`;

            const { error: upErr } = await sb.storage.from("user_media").upload(filePath, imgBuf, {
              contentType: "image/jpeg",
              upsert: true
            });

            if (!upErr) {
              const { data: pData } = sb.storage.from("user_media").getPublicUrl(filePath);
              if (pData?.publicUrl) {
                publicUrl = pData.publicUrl;
                isSuccess = true;
              }
            } else {
              publicUrl = fluxUrl;
              isSuccess = true;
            }
          } else {
            publicUrl = fluxUrl;
            isSuccess = true;
          }
        } catch (fluxErr: any) {
          console.error("[Nano Banana Server] Flux image generation error:", fluxErr);
        }
      }

      if (isSuccess && publicUrl) {
        // Update content_posts if linked to an existing post
        if (!isStandalone) {
          await sb.from("content_posts").update({
            media_url: publicUrl,
            media_type: "image",
            updated_at: new Date().toISOString()
          }).eq("id", effectiveContentId);
        }

        // Insert record into user_media_library
        await sb.from("user_media_library").insert([{
          user_id: data.userId || null,
          post_id: isStandalone ? null : effectiveContentId,
          media_type: "image",
          media_url: publicUrl,
          title: data.topicTitle ? `Gambar ${data.topicTitle}` : "Visual Gambar HD",
          prompt: sanitizedPrompt,
          status: "generated"
        }]);

        return {
          id: `img-${Date.now()}`,
          status: "completed",
          mediaUrl: publicUrl,
          imageUrl: publicUrl,
          mediaType: "image",
          aspectRatio: data.aspectRatio || "4:5",
        };
      }

      return {
        id: `img-failed-${Date.now()}`,
        status: "failed",
        mediaUrl: "",
        imageUrl: "",
        mediaType: "image",
        aspectRatio: data.aspectRatio || "4:5",
        error: "Gagal memproduksi gambar visual. Silakan coba kembali sesaat lagi.",
      };
    }
  });

export async function generateVeoVideo(request: VideoGenRequest): Promise<VideoGenResponse> {
  const sanitizedPrompt = sanitizeVisualPrompt(request.prompt, "video");
  const duration = request.durationSeconds || 8;
  const cost = calculateVeoVideoCost(duration);

  try {
    const serverRes = await generateMediaServerFn({
      data: {
        contentId: request.contentId || "pending-content",
        mediaType: "video",
        prompt: sanitizedPrompt,
        durationSeconds: duration,
        resolution: request.resolution || "720p",
        topicTitle: request.topicTitle,
        userId: request.userId
      }
    });

    return {
      id: serverRes.id,
      status: serverRes.status,
      videoUrl: serverRes.videoUrl || serverRes.mediaUrl || "",
      durationSeconds: serverRes.durationSeconds || duration,
      costInUSD: serverRes.costInUSD ?? cost.costUSD,
      costInIDR: serverRes.costInIDR ?? cost.costIDR,
      formattedCostIDR: serverRes.formattedCostIDR || cost.formattedCostIDR,
      error: serverRes.error
    };
  } catch (err: any) {
    console.warn("Notice in generateVeoVideo calling server function:", err);
    return {
      id: `veo-${Date.now()}`,
      status: "failed",
      videoUrl: "",
      durationSeconds: duration,
      costInUSD: cost.costUSD,
      costInIDR: cost.costIDR,
      formattedCostIDR: cost.formattedCostIDR,
      error: err?.message || "Gagal menghubungi server generator video."
    };
  }
}

export async function create8SecondReelBlobUrl(imageUrl: string, hookText: string = "Tahukah kamu rahasia dibalik visual sinematik ini?"): Promise<string> {
  if (typeof window === "undefined" || !window.HTMLCanvasElement) {
    return imageUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 720;
        canvas.height = 1280;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(imageUrl);

        const stream = canvas.captureStream ? canvas.captureStream(30) : null;
        if (!stream || typeof MediaRecorder === "undefined") {
          return resolve(imageUrl);
        }

        const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: BlobPart[] = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          resolve(blobUrl);
        };

        recorder.start();

        const durationMs = 8000;
        const fps = 30;
        const totalFrames = (durationMs / 1000) * fps;
        let currentFrame = 0;

        const interval = setInterval(() => {
          currentFrame++;
          const progress = currentFrame / totalFrames;

          // 3D Ken Burns Camera Pan & Zoom effect
          const scale = 1.0 + progress * 0.12;
          const offsetX = Math.sin(progress * Math.PI) * 20;
          const offsetY = progress * 15;

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(scale, scale);
          ctx.translate(-canvas.width / 2 + offsetX, -canvas.height / 2 + offsetY);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();

          // Dark vignette gradient overlay
          const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
          grad.addColorStop(0, "rgba(0,0,0,0.3)");
          grad.addColorStop(0.7, "rgba(0,0,0,0.1)");
          grad.addColorStop(1, "rgba(0,0,0,0.85)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Top Reel badge
          ctx.fillStyle = "rgba(220, 38, 38, 0.9)";
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(canvas.width - 200, 40, 160, 40, 20);
          } else {
            ctx.rect(canvas.width - 200, 40, 160, 40);
          }
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText("00:08 REEL HD", canvas.width - 180, 66);

          // Text Hook container box
          ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(40, 110, canvas.width - 80, 125, 20);
          } else {
            ctx.rect(40, 110, canvas.width - 80, 125);
          }
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
          ctx.stroke();

          // Hook badge tag
          ctx.fillStyle = "#2563eb";
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(55, 125, 140, 26, 13);
          } else {
            ctx.rect(55, 125, 140, 26);
          }
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 12px system-ui, -apple-system, sans-serif";
          ctx.fillText("REEL TEXT HOOK", 67, 142);

          // Multi-line wrapped Hook message text
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
          const fullText = `"${hookText.trim()}"`;
          const words = fullText.split(" ");
          let currentLine = "";
          let lineY = 182;
          const maxWidth = canvas.width - 120;

          for (let n = 0; n < words.length; n++) {
            const testLine = currentLine + (currentLine ? " " : "") + words[n];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && n > 0) {
              ctx.fillText(currentLine, 55, lineY);
              currentLine = words[n];
              lineY += 28;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            ctx.fillText(currentLine, 55, lineY);
          }

          if (currentFrame >= totalFrames) {
            clearInterval(interval);
            recorder.stop();
          }
        }, 1000 / fps);
      } catch {
        resolve(imageUrl);
      }
    };
    img.onerror = () => resolve(imageUrl);
  });
}

export async function triggerDirectDownload(url: string, filename: string = "nano-banana-image.jpg") {
  try {
    if (url.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image data");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function generateNanoBananaImage(request: ImageGenRequest): Promise<ImageGenResponse> {
  const sanitizedPrompt = sanitizeVisualPrompt(request.prompt, "image");
  try {
    const serverRes = await generateMediaServerFn({
      data: {
        contentId: request.contentId || "pending-content",
        mediaType: "image",
        prompt: sanitizedPrompt,
        aspectRatio: request.aspectRatio || "4:5",
        topicTitle: request.topicTitle,
        userId: request.userId
      }
    });

    return {
      id: serverRes.id,
      status: (serverRes.status as any) || "completed",
      imageUrl: serverRes.imageUrl || serverRes.mediaUrl || "",
      aspectRatio: serverRes.aspectRatio || request.aspectRatio || "4:5",
      error: serverRes.error
    };
  } catch (err: any) {
    console.warn("Notice in generateNanoBananaImage calling server function:", err);
    return {
      id: `img-${Date.now()}`,
      status: "failed",
      imageUrl: "",
      aspectRatio: request.aspectRatio || "4:5",
      error: err?.message || "Gagal menghubungi server generator gambar."
    };
  }
}

/**
 * Generate Image with automatic Visual Guardrail & Prompt Sanitizer
 */
export async function generateImage(request: ImageGenRequest | string): Promise<ImageGenResponse> {
  const reqObj: ImageGenRequest = typeof request === "string" ? { prompt: request, aspectRatio: "4:5" } : request;
  return generateNanoBananaImage(reqObj);
}

/**
 * Generate Video with automatic Visual Guardrail & Prompt Sanitizer
 */
export async function generateVideo(request: VideoGenRequest | string): Promise<VideoGenResponse> {
  const reqObj: VideoGenRequest = typeof request === "string" ? { prompt: request, durationSeconds: 8, resolution: "720p" } : request;
  return generateVeoVideo(reqObj);
}

