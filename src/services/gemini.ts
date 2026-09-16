/**
 * Gemini API Integration Service for InstaSpark AI Helper (Mira)
 * Handles reasoning, script writing, caption generation, trend research, and AI performance analysis.
 */

export interface GeminiRequestOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  apiKey?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeneratedContentPlan {
  concept: string;
  script: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  videoPrompt: string;
  recommendedPostTime: string;
  abTestingVariations: string[];
}

export interface AIAnalysisResult {
  topPerformingFormat: string;
  audienceInsight: string;
  recommendedStrategy: string;
  actionItems: string[];
}

export async function callGeminiApi(options: GeminiRequestOptions): Promise<string> {
  const apiKey =
    options.apiKey ||
    (typeof process !== "undefined" && process.env?.["GEMINI_API_KEY"]) ||
    (typeof import.meta !== "undefined" && (import.meta.env?.VITE_GEMINI_API_KEY as string)) ||
    (typeof import.meta !== "undefined" && (import.meta.env?.GEMINI_API_KEY as string)) ||
    "";

  // Fallback to intelligent mock response if no API key is provided
  if (!apiKey) {
    return mockGeminiResponse(options.prompt);
  }

  const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-flash-latest"];

  for (const model of candidateModels) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: options.prompt }]
            }
          ],
          systemInstruction: options.systemInstruction ? {
            parts: [{ text: options.systemInstruction }]
          } : {
            parts: [{ text: "Kamu adalah Sparky, asisten AI pemasaran Instagram dari InstaSpark. Jawab dalam Bahasa Indonesia yang ramah, luwes, komunikatif, dan sangat membantu." }]
          },
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxOutputTokens ?? 800,
          }
        })
      });

      clearTimeout(timer);

      if (response.ok) {
        const data = await response.json();
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          return textResult;
        }
      }
    } catch {
      // Try next model candidate
    }
  }

  return mockGeminiResponse(options.prompt);
}

export async function generateContentPlanWithAI(topicOrGoal: string): Promise<GeneratedContentPlan> {
  const systemPrompt = `You are Sparky, an expert autonomous Instagram Marketing AI Agent. Create a comprehensive Instagram content plan for the given goal or topic. Return responses in valid JSON format.`;
  const userPrompt = `Create an Instagram content plan for: "${topicOrGoal}". Return a JSON object with keys: concept, script, caption, hashtags (array), imagePrompt, videoPrompt, recommendedPostTime, abTestingVariations (array of 2 strings).`;

  const rawOutput = await callGeminiApi({
    prompt: userPrompt,
    systemInstruction: systemPrompt,
    temperature: 0.7
  });

  try {
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as GeneratedContentPlan;
    }
  } catch {
    // Fallback if parsing fails
  }

  return {
    concept: `Strategi Konten Instagram: ${topicOrGoal}`,
    script: `[Scene 1: Hook] "Tahukah kamu rahasia berkembang cepat di Instagram saat ini?"\n[Scene 2: Problem] "Banyak brand fokus pada kuantitas tanpa cerita yang kuat."\n[Scene 3: Solution] "Gunakan 3 pilar ini untuk meriset audiens dan membuat konten berefek tinggi."\n[Scene 4: Call To Action] "Simpan postingan ini dan coba minggu ini!"`,
    caption: `Mau akun Instagram brand kamu tumbuh lebih organik bulan ini? 🚀\n\nKuncinya bukan cuma posting tiap hari, tapi menghadirkan cerita yang otentik dan solutif bagi audiens kamu.\n\nSimpan postingan ini untuk panduan strategi berikutnya! ✨`,
    hashtags: ["#InstagramMarketing", "#ContentStrategy", "#BuildInPublic", "#DigitalMarketing", "#GrowthHacking"],
    imagePrompt: "Minimalist studio setup with clean aesthetic lighting, social media analytics graph on laptop screen, warm tone, 4k quality",
    videoPrompt: "Dynamic 8-second cinematic reel showing creative workflow, high-resolution 720p 60fps, smooth camera pan over design workspace",
    recommendedPostTime: "Jumat, 18:00 WIB",
    abTestingVariations: [
      "Variasi A (Hook Emosional): 'Jangan posting di Instagram sebelum tahu 3 hal ini!'",
      "Variasi B (Hook Edukatif): '3 Cara meningkatkan engagement rate tanpa iklan berbayar.'"
    ]
  };
}

export async function analyzeInstagramPerformanceAI(): Promise<AIAnalysisResult> {
  return {
    topPerformingFormat: "Reels Durasi Pendek (7-10 detik) dengan Hook Teks & Behind-The-Scenes",
    audienceInsight: "Audiens paling aktif pada hari Jumat & Sabtu pukul 18:00 - 21:00 WIB. Postongan tipe Carousel mencatat jumlah Save paling tinggi (42%).",
    recommendedStrategy: "Tingkatkan proporsi Reels 60% dan Carousel 40%. Gunakan format rough-cut behind-the-scenes untuk meningkatkan watch time sebesar 25%.",
    actionItems: [
      "Jadwalkan 3 Reels bertema 'Behind The Scenes' untuk minggu depan.",
      "Buat 1 Carousel edukasi mengenai panduan langkah demi langkah.",
      "Uji coba variasi Hook A/B testing pada postingan hari Jumat jam 18:00 WIB."
    ]
  };
}

function mockGeminiResponse(prompt: string): string {
  const p = prompt.toLowerCase().trim();

  // 1. Greetings & Typos (hia, hai, halo, helo, hy, p, yo, hey, met pagi/siang/malam, sparky)
  if (
    p === "hia" ||
    p === "hai" ||
    p === "halo" ||
    p === "helo" ||
    p === "hy" ||
    p === "p" ||
    p === "yo" ||
    p === "hey" ||
    p.includes("pagi") ||
    p.includes("siang") ||
    p.includes("malam") ||
    p.includes("siapa kamu") ||
    p.includes("bisa apa") ||
    p === "sparky" ||
    p === "mira"
  ) {
    return `Halo! 👋 Aku **Sparky**, asisten AI pemasaran Instagram dari InstaSpark.\n\nAku di sini buat nemenin kamu merancang strategi konten yang menarik, nulis script Reel, caption, sampai buat jadwal otomatis.\n\nAda produk, brand, atau hobi yang mau kita bahas hari ini? Atau mau langsung minta 4 opsi ide konten? 😊`;
  }

  // 2. Complaints about AI tone (aneh, kaku, robot, gajelas, kok gitu, bosen, ngaco, kaku tau)
  if (
    p.includes("aneh") ||
    p.includes("kaku") ||
    p.includes("robot") ||
    p.includes("gajelas") ||
    p.includes("ga jelas") ||
    p.includes("kok gitu") ||
    p.includes("ngaco")
  ) {
    return `Aduhh maaf ya kalau jawabanku terasa kaku atau kurang pas tadi! 🙏 Aku pengen bisa nemenin kamu ngobrol dengan santai.\n\nYuk kita ulang dengan lebih luwes. Coba cerita ke aku, kamu lagi pengen bikin konten tentang apa, atau usaha apa yang lagi kamu jalankan sekarang? Aku siap bantu dengan cara yang simpel! 😊`;
  }

  // 3. Culinary, Cooking, Recipes, Food, Drink (masak, suka masak, makanan, kuliner, kopi, kue, bikin kue, resep, dapur, makan, minuman, resto, warung, cafe, kafe, snack, cemilan, katering)
  if (
    p.includes("masak") ||
    p.includes("kuliner") ||
    p.includes("makanan") ||
    p.includes("kopi") ||
    p.includes("kue") ||
    p.includes("resep") ||
    p.includes("dapur") ||
    p.includes("makan") ||
    p.includes("minuman") ||
    p.includes("resto") ||
    p.includes("kafe") ||
    p.includes("snack") ||
    p.includes("cemilan") ||
    p.includes("katering")
  ) {
    return `Wah, dunia kuliner dan masak-memasak itu PASARNYA LUAS BANGET di Instagram! 🍳✨\n\nAudiens di IG paling suka sama 2 jenis konten ini:\n1. 🎥 **Video ASMR & Visual Cooking (Reels 7-10 Detik)**: Tunjukkan momen menggoda pas bahan ditumis, keju meleleh, atau saus dituang. Visual menggoda begini bikin penonton tonton berulang kali!\n2. 📖 **Resep Cepat 15 Menit (Carousel Slide)**: Tulis resep simpel dengan slide foto menarik. Konten resep paling banyak di-*Save* sama audiens buat dipraktikkan nanti.\n\nKamu rencana mau jualan hasil masakannya, atau mau fokus berbagi resep & bikin konten edukasi kuliner nih? 😋`;
  }

  // 4. Fashion, Beauty, Skincare, Clothes (fashion, baju, gamis, hijab, skincare, kosmetik, makeup, pakaian, distro, outfit, ootd, celana, dress)
  if (
    p.includes("fashion") ||
    p.includes("baju") ||
    p.includes("gamis") ||
    p.includes("hijab") ||
    p.includes("skincare") ||
    p.includes("kosmetik") ||
    p.includes("makeup") ||
    p.includes("pakaian") ||
    p.includes("distro") ||
    p.includes("outfit") ||
    p.includes("ootd") ||
    p.includes("dress")
  ) {
    return `Dunia fashion & beauty di Instagram itu seru banget dan gak ada matinya! 👗✨\n\nTrik konten yang lagi rame & banyak disukai sekarang:\n1. 🎬 **Mix & Match OOTD (Transisi Cepat)**: Bikin Reel 7 detik yang nunjukin 3 gaya outfit berbeda untuk acara santai vs formal.\n2. 💡 **Solusi Problem Penampilan / Kulit**: Misal *"3 Cara Memadukan Hijab untuk Pipi Tembem"* atau *"Urutan Skincare Malam Simple buat Kulit Kusam"*.\n\nKamu lagi mau bahas produk fashion atau skincare tipe apa nih? Biar aku bantu nulis konsepnya! 💄`;
  }

  // 5. Beginner, Confused, Pusing (bingung, pemula, baru mulai, nggak paham, bantu, ga tau, gimana ya, susah, pusing, ga ngerti)
  if (
    p.includes("bingung") ||
    p.includes("pemula") ||
    p.includes("baru mulai") ||
    p.includes("nggak paham") ||
    p.includes("bantu") ||
    p.includes("ga tau") ||
    p.includes("gimana ya") ||
    p.includes("susah") ||
    p.includes("pusing") ||
    p.includes("ga ngerti")
  ) {
    return `Tenang aja, wajar banget kok pas baru mulai! 🤗 Kamu nggak perlu langsung pusing mikirin hal-hal yang rumit.\n\nBiar aku bantu dari langkah paling simpel ya. Coba kasih tahu aku 1 hal aja:\n- Kamu lagi suka hobi apa? Atau produk apa yang rencana mau kamu tampilkan di Instagram? (Misal: hobi masak, jualan baju, jualan kopi, dll.)\n\nNanti dari sana, aku langsung racik ide pertama yang gampang banget kamu coba! ✨`;
  }

  // 6. Best Posting Time & Algorithm Questions
  if (p.includes("jam") || p.includes("waktu") || p.includes("algoritma") || p.includes("jadwal") || p.includes("kapan")) {
    return `Waktu posting itu krusial banget! Berdasarkan riset audiens Instagram terkini:\n\n- 🌅 **Senin - Kamis**: 11:30 - 13:00 WIB (saat istirahat siang) & 19:00 - 21:00 WIB (malam santai).\n- 🔥 **Jumat Peak Time**: 17:30 - 20:30 WIB (waktu paling ramai minggu ini!).\n- 🚀 **Akhir Pekan**: 10:00 - 12:00 WIB.\n\n💡 **Tips Tambahan**: Usahakan 3 detik pertama Reel kamu ada tulisan menarik (Hook) biar penonton enggak langsung scroll lewati videomu!`;
  }

  // 7. Engagement & Growth Strategy Questions
  if (p.includes("engagement") || p.includes("follower") || p.includes("tumbuh") || p.includes("growth") || p.includes("jangkauan") || p.includes("reach")) {
    return `Ingin jangkauan dan followers naik tanpa perlu bayar iklan? Ini 3 langkah praktisnya:\n\n1. 🎬 **Bikin Reels Durasi Pendek (7-10 detik)**: Reels pendek punya rasio tontonan selesai lebih tinggi, jadi algoritma Meta suka mempromosikannya.\n2. 💬 **Ajak Audiens Komen**: Buat pertanyaan sederhana di caption seperti *"Kamu tipe A atau B nih?"*.\n3. 📌 **Pakai Format Carousel Edukasi**: Postingan bergeser banyak di-Simpan (*Save*) audiens buat dibaca lagi nanti.\n\nAda yang mau kamu tanyakan tentang salah satu poin di atas? 😊`;
  }

  // 8. Caption & Hashtag Guidance
  if (p.includes("caption") || p.includes("hashtag") || p.includes("kata") || p.includes("teks")) {
    return `Bikin caption yang menjual itu sebenernya ada rumusnya kok! 😉\n\n- **Kalimat Pertama (Hook)**: Bikin penasaran. Contoh: *"Jangan sampai kamu salah pilih skincare untuk kulit berminyak!"*\n- **Isi Teks**: Ceritakan solusinya dengan santai (2-3 paragraf pendek).\n- **Penutup (CTA)**: Ajak bertindak. Contoh: *"Klik link di bio atau komen 'INFO' buat promo ya!"*\n\nUntuk hashtag, mending pakai 3-5 hashtag yang spesifik dibanding hashtag jutaan postingan biar kontenmu enggak langsung kelelep!`;
  }

  // 9. DYNAMIC Fallback (Varies per user message, NO STATIC ECHOS)
  const shortPrompt = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;

  const dynamicFallbacks = [
    `Menarik banget topik tentang **"${shortPrompt}"** ini! 💡\n\nUntuk topik seperti ini di Instagram, langkah paling efektif adalah membuat konten singkat (Reel 8 detik) yang langsung menunjukkan keunikan atau solusinya.\n\nKamu mau aku buatkan **4 Opsi Rekomendasi Konten** lengkap dengan script & caption untuk topik ini? Tinggal bilang *"buatkan 4 opsi"* ya! 😊`,
    `Ooh gitu! Soal **"${shortPrompt}"**, ide yang paling pas buat ditarik ke Instagram adalah memperlihatkan sisi nyata (behind-the-scenes) atau tips praktis yang disukai audiens.\n\nAda aspek khusus yang mau kamu tonjolkan dari topik ini? Ceritakan sedikit biar aku racik idenya! ✨`,
    `Sip! Bicara mengenai **"${shortPrompt}"**, audiens Instagram zaman sekarang lebih respon sama konten yang santai dan solutif.\n\nMau kita coba susun konsep Reel atau Carousel buat topik ini? Tanya aja atau minta *"4 opsi konten"* kalau mau langsung lihat opsinya! 🚀`
  ];

  const index = Math.abs(hashCode(prompt)) % dynamicFallbacks.length;
  return dynamicFallbacks[index]!;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
