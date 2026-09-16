import { generateContentPlanWithAI, GeneratedContentPlan, callGeminiApi } from "./gemini";
import { calculateVeoVideoCost } from "./media-services";
import { savePostToDb, supabase, ContentPostItem, getTodayLocalDateString } from "../lib/supabase";

export interface TopicRatio {
  id?: string;
  topicName: string;
  percentage: number;
}

export interface ContentRecommendationOption {
  id: string;
  title: string;
  angle: string;
  category: string;
  format: "Reel" | "Carousel" | "Single Post";
  estimatedReach: string;
  status: "pending" | "approved" | "rejected";
}

export interface ApprovedContentResult {
  optionId: string;
  title: string;
  script: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  videoPrompt: string;
  veoDurationSeconds: number;
  veoCostUSD: number;
  veoCostIDR: number;
  formattedVeoCostIDR: string;
  recommendedPostTime: string;
  savedPostId: string;
}

let activeRatios: TopicRatio[] = [
  { topicName: "Teknologi & AI", percentage: 75 },
  { topicName: "Edukasi & Alam", percentage: 25 }
];

export async function getTopicRatios(): Promise<TopicRatio[]> {
  if (supabase) {
    try {
      const { data } = await supabase.from("topic_ratios").select("*");
      if (data && data.length > 0) {
        return data.map((d: any) => ({
          id: String(d.id),
          topicName: String(d.topic_name),
          percentage: Number(d.percentage)
        }));
      }
    } catch (e) {
      console.warn("Error fetching topic ratios from Supabase:", e);
    }
  }
  return activeRatios;
}

export async function saveTopicRatios(ratios: TopicRatio[]): Promise<TopicRatio[]> {
  activeRatios = ratios;
  if (supabase) {
    try {
      await supabase.from("topic_ratios").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const rows = ratios.map((r) => ({ topic_name: r.topicName, percentage: r.percentage }));
      await supabase.from("topic_ratios").insert(rows);
    } catch (e) {
      console.warn("Error saving topic ratios to Supabase:", e);
    }
  }
  return activeRatios;
}

export async function generateFourContentOptions(
  customRatios?: TopicRatio[],
  newsContext?: string
): Promise<ContentRecommendationOption[]> {
  const ratios = customRatios || (await getTopicRatios());
  const primaryTopic = ratios[0]?.topicName || "Teknologi & AI";
  const secondaryTopic = ratios[1]?.topicName || "Edukasi & Alam";
  const primaryPct = ratios[0]?.percentage || 75;
  const secondaryPct = ratios[1]?.percentage || 25;

  try {
    const contextPrompt = newsContext?.trim()
      ? `Selected News / Conversation Context:
"${newsContext.trim()}"

Brand Pillar Ratios:
- Primary (${primaryPct}%): "${primaryTopic}"
- Secondary (${secondaryPct}%): "${secondaryTopic}"

Task: Generate 4 fresh, unique, engaging, and trending Instagram content ideas based on the news context above while aligning with the brand pillars.`
      : `Brand Pillar Ratios:
- Primary (${primaryPct}%): "${primaryTopic}"
- Secondary (${secondaryPct}%): "${secondaryTopic}"

Task: Generate 4 fresh, unique, engaging, and trending Instagram content ideas based on:
Primary (${primaryPct}%): "${primaryTopic}"
Secondary (${secondaryPct}%): "${secondaryTopic}"`;

    const prompt = `${contextPrompt}

Return a valid JSON array containing EXACTLY 4 objects with this structure:
[
  {
    "id": "opt-1",
    "title": "Judul konten yang menarik dan relevan dalam Bahasa Indonesia",
    "angle": "Sudut pandang atau strategi konten yang jelas dalam Bahasa Indonesia",
    "category": "${primaryTopic}",
    "format": "Reel",
    "estimatedReach": "45K - 60K Reach",
    "status": "pending"
  }
]

Guidelines:
- format must be one of: "Reel", "Carousel", or "Single Post"
- category should reflect "${primaryTopic}" or "${secondaryTopic}"
- title & angle must be in attractive Bahasa Indonesia for Instagram
- estimatedReach format: "XXK - XXK Reach"
- return ONLY the JSON array without backticks or markdown if possible`;

    const raw = await callGeminiApi({
      prompt,
      systemInstruction: "You are Sparky, an expert autonomous Instagram Marketing AI Agent. Generate 4 high-performing Instagram content recommendations. Always return a valid JSON array of 4 recommendation objects.",
      temperature: 0.8
    });

    const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length >= 4) {
        return parsed.slice(0, 4).map((item: any, idx: number) => ({
          id: `opt-${Date.now()}-${idx}`,
          title: String(item.title),
          angle: String(item.angle),
          category: String(item.category || (idx < 2 ? primaryTopic : secondaryTopic)),
          format: (item.format === "Reel" || item.format === "Carousel" || item.format === "Single Post")
            ? item.format
            : (idx % 2 === 0 ? "Reel" : "Carousel"),
          estimatedReach: String(item.estimatedReach || `${30 + idx * 5}K - ${45 + idx * 5}K Reach`),
          status: "pending" as const
        }));
      }
    }
  } catch (e) {
    console.warn("Gemini dynamic options notice, using dynamic pool generator:", e);
  }

  return generateDynamicPoolOptions(primaryTopic, secondaryTopic, primaryPct, secondaryPct);
}

function generateDynamicPoolOptions(
  primaryTopic: string,
  secondaryTopic: string,
  primaryPct: number,
  secondaryPct: number
): ContentRecommendationOption[] {
  const ts = Date.now();

  const getTopicTemplates = (topic: string) => {
    const t = topic.toLowerCase();
    if (t.includes("teknologi") || t.includes("ai") || t.includes("tech")) {
      return [
        {
          title: `Update AI 2026: 3 Alat Terbaru yang Mengubah Efisiensi Kerja`,
          angle: "Ulasan praktis otomasi alur kerja dengan AI untuk menghemat waktu 10 jam/minggu.",
          format: "Reel" as const,
          reach: "48K - 65K Reach"
        },
        {
          title: `Panduan Praktis: Membangun Agent AI Mandiri Tanpa Coding`,
          angle: "Infografis langkah demi langkah untuk pemula yang ingin memanfaatkan AI.",
          format: "Carousel" as const,
          reach: "35K - 50K Reach"
        },
        {
          title: `Sora vs Veo 3.1: Perbandingan Realistis Generator Video AI`,
          angle: "Bedah fitur & kualitas visual untuk kreator konten Reels & TikTok.",
          format: "Reel" as const,
          reach: "52K - 70K Reach"
        },
        {
          title: `5 Trik Prompt Engineering Sehari-hari yang Jarang Diketahui`,
          angle: "Tips cepat meningkatkan kualitas jawaban AI untuk kebutuhan bisnis.",
          format: "Carousel" as const,
          reach: "40K - 55K Reach"
        },
        {
          title: `Studi Kasus: Bagaimana AI Memangkas Waktu Pembuatan Konten 70%`,
          angle: "Kisah nyata efisiensi agensi digital memanfaatkan teknologi AI.",
          format: "Single Post" as const,
          reach: "28K - 42K Reach"
        }
      ];
    }

    if (t.includes("edukasi") || t.includes("alam") || t.includes("lingkungan") || t.includes("sustainability")) {
      return [
        {
          title: `Inovasi Teknologi Hijau: Solusi Nyata Menghadapi Krisis Energi`,
          angle: "Storytelling inspiratif bagaimana teknologi dan edukasi alam berpadu.",
          format: "Reel" as const,
          reach: "32K - 45K Reach"
        },
        {
          title: `Mitos vs Fakta: Benarkah Server AI Memboroskan Energi Listrik?`,
          angle: "Konten edukatif interaktif memicu diskusi dan komentar positif audiens.",
          format: "Carousel" as const,
          reach: "25K - 38K Reach"
        },
        {
          title: `Panduan 60 Detik: Langkah Cepat Mengurangi Jejak Karbon Digital`,
          angle: "Tips simpel sehari-hari yang mudah dipraktikkan oleh siapapun.",
          format: "Reel" as const,
          reach: "30K - 42K Reach"
        },
        {
          title: `Tren Eco-Tech 2026: 3 Startup Lokal yang Berhasil Daur Ulang Sampah`,
          angle: "Riset tren & apresiasi komunitas lokal yang berdampak sosial.",
          format: "Carousel" as const,
          reach: "28K - 40K Reach"
        }
      ];
    }

    if (t.includes("masak") || t.includes("kuliner") || t.includes("makanan") || t.includes("kopi")) {
      return [
        {
          title: `Resep Cepat 10 Menit: Menu Sehat & Hemat untuk Pekerja Sibuk`,
          angle: "Video visual masak singkat 8 detik dengan alur menenangkan.",
          format: "Reel" as const,
          reach: "50K - 75K Reach"
        },
        {
          title: `Rahasia Kopi Aesthetic ala Cafe di Rumah Tanpa Mesin Mahal`,
          angle: "Carousel foto slide urutan menyeduh kopi nikmat & hemat.",
          format: "Carousel" as const,
          reach: "38K - 52K Reach"
        },
        {
          title: `Review Jujur: Makanan Viral Minggu Ini Worth It atau Cuma Tren?`,
          angle: "Konten reaksi jujur yang memancing engagement tinggi.",
          format: "Reel" as const,
          reach: "60K - 85K Reach"
        }
      ];
    }

    if (t.includes("fashion") || t.includes("baju") || t.includes("skincare") || t.includes("makeup")) {
      return [
        {
          title: `3 Kombinasi Outfit Simple untuk Tampil Profesional Tanpa Ribet`,
          angle: "Transisi OOTD cepat 7 detik dengan kombinasi warna hangat.",
          format: "Reel" as const,
          reach: "45K - 68K Reach"
        },
        {
          title: `Urutan Skincare Malam Terbaik untuk Kulit Glowing di Pagi Hari`,
          angle: "Panduan urutan produk yang jelas untuk kesehatan kulit.",
          format: "Carousel" as const,
          reach: "35K - 50K Reach"
        },
        {
          title: `Mitos vs Fakta Skincare: Kesalahan Umum yang Bikin Wajah Kusam`,
          angle: "Konten edukasi kecantikan yang banyak di-Save audiens.",
          format: "Carousel" as const,
          reach: "40K - 58K Reach"
        }
      ];
    }

    return [
      {
        title: `Riset Tren Terkini: 3 Peluang Besar di Bidang ${topic}`,
        angle: "Bedah potensi dan strategi pemasaran di era digital 2026.",
        format: "Reel" as const,
        reach: "35K - 50K Reach"
      },
      {
        title: `Panduan Lengkap Memahami ${topic} untuk Pemula`,
        angle: "Infografis edukatif langkah demi langkah yang mudah dipahami.",
        format: "Carousel" as const,
        reach: "28K - 40K Reach"
      },
      {
        title: `Studi Kasus Sukses: Strategi Pertumbuhan Brand Bertema ${topic}`,
        angle: "Ulasan taktik nyata yang terbukti meningkatkan loyalitas audiens.",
        format: "Single Post" as const,
        reach: "22K - 35K Reach"
      },
      {
        title: `Mitos vs Fakta Mengenai ${topic} yang Jarang Diketahui`,
        angle: "Konten diskusi interaktif memancing komentar audiens.",
        format: "Carousel" as const,
        reach: "30K - 45K Reach"
      }
    ];
  };

  const primaryPool = getTopicTemplates(primaryTopic);
  const secondaryPool = getTopicTemplates(secondaryTopic);

  const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  const pShuffled = shuffle(primaryPool);
  const sShuffled = shuffle(secondaryPool);

  const opt1 = pShuffled[0] || primaryPool[0];
  const opt2 = pShuffled[1] || primaryPool[1] || pShuffled[0];
  const opt3 = sShuffled[0] || secondaryPool[0];
  const opt4 = sShuffled[1] || secondaryPool[1] || sShuffled[0];

  return [
    {
      id: `opt-${ts}-1`,
      title: `${opt1.title} (${primaryPct}% ${primaryTopic})`,
      angle: opt1.angle,
      category: primaryTopic,
      format: opt1.format,
      estimatedReach: opt1.reach,
      status: "pending"
    },
    {
      id: `opt-${ts}-2`,
      title: `${opt2.title}`,
      angle: opt2.angle,
      category: primaryTopic,
      format: opt2.format,
      estimatedReach: opt2.reach,
      status: "pending"
    },
    {
      id: `opt-${ts}-3`,
      title: `${opt3.title} (${secondaryPct}% ${secondaryTopic})`,
      angle: opt3.angle,
      category: secondaryTopic,
      format: opt3.format,
      estimatedReach: opt3.reach,
      status: "pending"
    },
    {
      id: `opt-${ts}-4`,
      title: `${opt4.title}`,
      angle: opt4.angle,
      category: secondaryTopic,
      format: opt4.format,
      estimatedReach: opt4.reach,
      status: "pending"
    }
  ];
}

export async function approveAndGenerateContent(
  selectedOption: ContentRecommendationOption,
  userId?: string,
  existingPostId?: string
): Promise<ApprovedContentResult> {
  const plan: GeneratedContentPlan = await generateContentPlanWithAI(selectedOption.title);

  const durationSec = 8;
  const veoCost = calculateVeoVideoCost(durationSec);

  const todayStr = getTodayLocalDateString();

  const postData: Partial<ContentPostItem> = {
    ...(existingPostId ? { id: existingPostId } : {}),
    user_id: userId,
    title: selectedOption.title,
    concept: selectedOption.angle,
    script: plan.script,
    caption: plan.caption,
    hashtags: plan.hashtags,
    image_prompt: plan.imagePrompt,
    video_prompt: plan.videoPrompt,
    veo_duration_seconds: durationSec,
    veo_cost_usd: veoCost.costUSD,
    veo_cost_idr: veoCost.costIDR,
    recommended_time: plan.recommendedPostTime || "18:00 WIB",
    scheduled_date: todayStr,
    scheduled_time: "18:00",
    status: "Scheduled"
  };

  const savedPost = await savePostToDb(postData);

  return {
    optionId: selectedOption.id,
    title: selectedOption.title,
    script: plan.script,
    caption: plan.caption,
    hashtags: plan.hashtags,
    imagePrompt: plan.imagePrompt,
    videoPrompt: plan.videoPrompt,
    veoDurationSeconds: durationSec,
    veoCostUSD: veoCost.costUSD,
    veoCostIDR: veoCost.costIDR,
    formattedVeoCostIDR: veoCost.formattedCostIDR,
    recommendedPostTime: plan.recommendedPostTime || "Jumat, 18:00 WIB",
    savedPostId: savedPost.id
  };
}

export interface RevisedContentResult {
  title: string;
  concept?: string;
  script: string;
  caption: string;
  hashtags: string[];
  image_prompt?: string;
  video_prompt?: string;
  summaryOfChanges: string;
}

export async function reviseContentWithAI(
  currentContent: ContentPostItem,
  revisionInstruction: string
): Promise<RevisedContentResult> {
  const prompt = `Kamu adalah Sparky, asisten AI konsultan pemasaran Instagram.
Pengguna ingin merevisi draf konten Instagram yang sudah ada.

KONTEN SAAT INI:
- Judul: ${currentContent.title}
- Konsep/Angle: ${currentContent.concept || "-"}
- Skrip Video:
${currentContent.script}
- Caption:
${currentContent.caption}
- Hashtags: ${(currentContent.hashtags || []).join(" ")}
- Prompt Visual Image: ${currentContent.image_prompt || "-"}
- Prompt Video: ${currentContent.video_prompt || "-"}

INSTRUKSI REVISI DARI PENGGUNA:
"${revisionInstruction}"

ATURAN REVISI:
1. Revisi HANYA bagian yang diminta secara spesifik oleh pengguna dalam instruksinya.
2. JANGAN mengubah bagian lain yang TIDAK diminta untuk diubah. Pertahankan teks aslinya secara presisi!
   - Contoh: Jika pengguna hanya minta "buat caption lebih pendek" atau "ganti caption", ubah HANYA caption. Skrip dan judul TETAP SAMA PERSIS.
   - Contoh: Jika pengguna minta "revisi script scene 2", ubah bagian skrip yang relevan. Caption dan judul TETAP SAMA PERSIS.
   - Contoh: Jika pengguna minta "ubah judul jadi lebih santai", ubah HANYA judul. Bagian lain TETAP SAMA PERSIS.
3. Kembalikan respons dalam format JSON valid berikut tanpa pembungkus markdown apapun di luar JSON:
{
  "title": "judul konten",
  "concept": "konsep/angle",
  "script": "skrip video scene by scene",
  "caption": "caption instagram lengkap",
  "hashtags": ["#tag1", "#tag2"],
  "imagePrompt": "prompt visual gambar",
  "videoPrompt": "prompt video",
  "summaryOfChanges": "Penjelasan ramah 1 kalimat mengenai bagian apa yang baru saja direvisi sesuai permintaan pengguna."
}`;

  try {
    const raw = await callGeminiApi({
      prompt,
      systemInstruction: "You are Sparky, an expert autonomous Instagram Marketing AI. Always return a valid JSON object matching the requested schema.",
      temperature: 0.7
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        title: String(parsed.title || currentContent.title),
        concept: String(parsed.concept || currentContent.concept || ""),
        script: String(parsed.script || currentContent.script),
        caption: String(parsed.caption || currentContent.caption),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : (currentContent.hashtags || []),
        image_prompt: parsed.imagePrompt || currentContent.image_prompt,
        video_prompt: parsed.videoPrompt || currentContent.video_prompt,
        summaryOfChanges: String(parsed.summaryOfChanges || "Perubahan telah berhasil diterapkan pada konten.")
      };
    }
  } catch (err) {
    console.warn("Notice in reviseContentWithAI Gemini call, using fallback:", err);
  }

  // Fallback if AI JSON parse fails
  return {
    title: currentContent.title,
    concept: currentContent.concept,
    script: currentContent.script,
    caption: `${currentContent.caption}\n\n(Catatan revisi: ${revisionInstruction})`,
    hashtags: currentContent.hashtags || [],
    image_prompt: currentContent.image_prompt,
    video_prompt: currentContent.video_prompt,
    summaryOfChanges: `Catatan revisi "${revisionInstruction}" telah ditambahkan ke draf konten.`
  };
}
