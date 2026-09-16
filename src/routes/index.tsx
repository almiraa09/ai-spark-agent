import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, CheckCircle2, Clapperboard, Copy, DollarSign, Download, Layers, RotateCcw, Sparkles, SlidersHorizontal, TrendingUp, Wand2, ShieldCheck, PanelLeft, Plus, MessageSquare, Trash2, LogIn, X, XCircle, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveAndGenerateContent,
  ApprovedContentResult,
  ContentRecommendationOption,
  generateFourContentOptions,
  getTopicRatios,
  saveTopicRatios,
  reviseContentWithAI,
  TopicRatio
} from "@/services/agent-engine";
import { callGeminiApi } from "@/services/gemini";
import { generateNanoBananaImage, generateVeoVideo, triggerDirectDownload, create8SecondReelBlobUrl } from "@/services/media-services";
import {
  getCurrentUser,
  getUserConversations,
  createConversation,
  deleteConversation,
  getConversationMessages,
  saveChatMessageToDb,
  saveMediaToLibrary,
  savePostToDb,
  fetchAllPostsFromDb,
  ContentPostItem,
  isValidMediaUrl,
  attachMediaToPost,
  getMediaByPostId,
  getTodayLocalDateString,
  UserSession,
  ChatConversationItem,
  type SelectedNewsContext,
  SELECTED_NEWS_CONTEXT_KEY
} from "@/lib/supabase";
import { AuthModal } from "@/components/auth-modal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sparky — Autonomous Instagram Marketing AI Agent" },
      { name: "description", content: "Turn ideas into high-performing Instagram campaigns with Sparky AI Agent." },
      { property: "og:title", content: "Sparky — AI Agent" },
    ],
  }),
  component: IndexPage,
});

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  type?: "general" | "recommendation_cards" | "image_card" | "video_card";
  imageUrl?: string;
  videoUrl?: string;
  topicTitle?: string;
  options?: ContentRecommendationOption[];
  approvedData?: ApprovedContentResult;
  contentId?: string;
  isProcessingAcc?: boolean;
}

export function IndexPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [openAuthModal, setOpenAuthModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // ChatGPT Style Sidebar & Thread State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<ChatConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeContentId, setActiveContentId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledNewsContextTimestampRef = useRef<number | null>(null);

  const getLatestContentId = (msgs: ChatMessage[] = messages): string | null => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.contentId) return m.contentId;
      if (m.approvedData?.savedPostId) return m.approvedData.savedPostId;
    }
    return null;
  };

  // Topic Ratio Presets (Default: 75% Teknologi & AI, 25% Edukasi & Alam)
  const [topic1, setTopic1] = useState("Teknologi & AI");
  const [pct1, setPct1] = useState(75);
  const [topic2, setTopic2] = useState("Edukasi & Alam");
  const [pct2, setPct2] = useState(25);
  const [showRatioSettings, setShowRatioSettings] = useState(false);

  const handlePendingNewsContext = async (user: UserSession): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const raw = sessionStorage.getItem(SELECTED_NEWS_CONTEXT_KEY);
    if (!raw) return false;

    // Immediately remove from sessionStorage to prevent duplicate execution
    sessionStorage.removeItem(SELECTED_NEWS_CONTEXT_KEY);

    let payload: SelectedNewsContext;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse selected news context from sessionStorage:", e);
      return false;
    }

    if (!payload || !payload.title) return false;

    // Prevent duplicate processing in rapid re-renders or React StrictMode
    if (handledNewsContextTimestampRef.current === payload.timestamp) {
      return false;
    }
    handledNewsContextTimestampRef.current = payload.timestamp;

    try {
      const cleanTitle = (payload.title || "").trim();
      const convTitle = `Ide: ${cleanTitle.slice(0, 32)}`;

      // 1. Create new conversation thread in Supabase / LocalStorage
      const newThread = await createConversation(user.id, convTitle);

      // 2. Format user message naturally as the user submitting the news context
      const parts: string[] = [
        "Halo Sparky, tolong bantu aku analisis berita ini untuk ide konten Instagram:",
        "",
        `📰 *Judul:* ${payload.title}`,
        `🏢 *Sumber:* ${payload.source}${payload.topic ? ` (${payload.topic})` : ""}`,
      ];
      if (payload.published_at) {
        parts.push(`📅 *Tanggal:* ${payload.published_at}`);
      }
      if (payload.excerpt) {
        parts.push(`📝 *Ringkasan:* ${payload.excerpt}`);
      }
      if (payload.url) {
        parts.push(`🔗 *Link:* ${payload.url}`);
      }
      parts.push("");
      parts.push("Bagaimana tanggapanmu tentang berita ini dan apa saja ide strategi konten yang relevan untuk akun Instagramku?");
      const messageText = parts.join("\n");

      const userMsgId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        text: messageText,
        type: "general",
      };

      // 3. Save initial user message to database / local storage
      await saveChatMessageToDb(
        user.id,
        newThread.id,
        "user",
        messageText,
        undefined,
        convTitle
      );

      // 4. Update component state and activate the thread
      setActiveConvId(newThread.id);
      setConversations((prev) => [newThread, ...prev.filter((c) => c.id !== newThread.id)]);
      setMessages([userMsg]);
      setHasStarted(true);
      setIsTyping(true);

      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);

      // 5. Trigger Gemini AI analysis for the selected news using existing callGeminiApi
      (async () => {
        try {
          const systemInstruction =
            "Kamu adalah Sparky, asisten AI konsultan pemasaran Instagram dari InstaSpark.\n" +
            "User baru saja memilih berita tren/industri pemasaran untuk didiskusikan dan dijadikan ide konten Instagram.\n\n" +
            "TUGAS KAMU PADA RESPONS PERTAMA INI:\n" +
            "1. Baca dan pahami inti berita yang dikirim user secara spesifik.\n" +
            "2. Berikan analisis singkat mengapa berita ini relevan dan menarik untuk strategi konten Instagram/social media saat ini.\n" +
            "3. Berikan insight awal atau 2-3 potensi sudut pandang (angle) konten yang bisa dikembangkan (misalnya perbandingan, tips edukasi, atau opini/reaksi tren).\n" +
            "4. Ajak user untuk melanjutkan diskusi atau menentukan arah konsep yang ingin mereka kembangkan.\n\n" +
            "ATURAN WAJIB:\n" +
            "- JANGAN langsung membuat caption final, hashtag lengkap, script video detail, storyboard, atau membuat gambar/video.\n" +
            "- JANGAN menjalankan approval workflow atau langsung menyimpan postingan.\n" +
            "- Tulis dalam Bahasa Indonesia yang ramah, profesional, luwes, dan natural (2-3 paragraf ringkas).\n" +
            "- Respons harus spesifik mengacu pada berita yang dikirim, bukan template kaku atau sambutan umum.";

          const aiReply = await callGeminiApi({
            prompt: messageText,
            systemInstruction,
            temperature: 0.7,
          });

          const agentMsgId = crypto.randomUUID();
          const agentMsg: ChatMessage = {
            id: agentMsgId,
            role: "agent",
            text: aiReply,
            type: "general",
          };

          setMessages((prev) => [...prev, agentMsg]);

          // Save AI response to DB/localStorage under the same conversation thread
          await saveChatMessageToDb(
            user.id,
            newThread.id,
            "sparky",
            aiReply,
            { type: "general" }
          );
        } catch (err) {
          console.error("Error generating Gemini response for news:", err);
          const errorFallback = "Mohon maaf, terjadi kendala saat menghubungkan ke Gemini untuk menganalisis berita ini. Kamu tetap bisa mengetik tanggapan atau pertanyaanmu di bawah untuk melanjutkan diskusi dengan Sparky.";
          const fallbackMsgId = crypto.randomUUID();
          const fallbackMsg: ChatMessage = {
            id: fallbackMsgId,
            role: "agent",
            text: errorFallback,
            type: "general",
          };
          setMessages((prev) => [...prev, fallbackMsg]);
          await saveChatMessageToDb(
            user.id,
            newThread.id,
            "sparky",
            errorFallback,
            { type: "general" }
          );
        } finally {
          setIsTyping(false);
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }, 100);
        }
      })();

      return true;
    } catch (err) {
      console.error("Error handling pending news context:", err);
      setIsTyping(false);
      return false;
    }
  };

  const loadConversationsAndActiveThread = async (userId: string, userEmail?: string, userSession?: UserSession) => {
    try {
      const threads = await getUserConversations(userId, userEmail);
      setConversations(threads);

      // Check if there is pending selected news context from /news
      const user = userSession || currentUser;
      if (user) {
        const handled = await handlePendingNewsContext(user);
        if (handled) {
          return;
        }
      }

      if (threads.length > 0 && !activeConvId) {
        selectConversation(threads[0].id, userId);
      }
    } catch (e) {
      console.warn("Error loading user conversations:", e);
    }
  };

  const selectConversation = async (convId: string, userId?: string) => {
    const uid = userId || currentUser?.id;
    if (!uid) return;
    setActiveConvId(convId);
    try {
      const msgs = await getConversationMessages(convId, uid, currentUser?.email);
      if (msgs.length > 0) {
        const loadedMsgs: ChatMessage[] = msgs.map((m) => ({
          id: m.id,
          role: m.sender === "user" ? "user" : "agent",
          text: m.content,
          type: m.actions?.type || "general",
          imageUrl: m.actions?.imageUrl,
          videoUrl: m.actions?.videoUrl,
          topicTitle: m.actions?.topicTitle,
          options: m.actions?.options,
          approvedData: m.actions?.approvedData,
          contentId: m.actions?.contentId || m.actions?.approvedData?.savedPostId
        }));
        setMessages(loadedMsgs);
        setHasStarted(true);
        setActiveContentId(getLatestContentId(loadedMsgs));
      } else {
        setMessages([]);
        setHasStarted(false);
        setActiveContentId(null);
      }
    } catch (e) {
      console.warn("Error switching conversation thread:", e);
    }
  };

  const [accModalData, setAccModalData] = useState<{
    isOpen: boolean;
    contentId?: string;
    mediaUrl: string;
    mediaType: "image" | "video";
    title: string;
    caption: string;
  } | null>(null);
  const [accScheduledDate, setAccScheduledDate] = useState(() => getTodayLocalDateString());
  const [accScheduledTime, setAccScheduledTime] = useState("18:00");
  const [accSuccessMsg, setAccSuccessMsg] = useState<string | null>(null);

  const handleSaveAccToPlanner = async () => {
    if (!accModalData || !currentUser) return;
    try {
      const effectiveContentId = accModalData.contentId || activeContentId || null;

      // 1. Save or update media library with post_id linking to content_posts
      if (accModalData.mediaUrl) {
        await saveMediaToLibrary(currentUser.id, {
          post_id: effectiveContentId,
          media_type: accModalData.mediaType,
          media_url: accModalData.mediaUrl,
          title: accModalData.title,
          status: "scheduled",
          scheduled_date: accScheduledDate,
          caption: accModalData.caption
        });
      }

      // 2. If contentId exists: UPDATE existing content_posts (NO duplicate!)
      if (effectiveContentId) {
        await savePostToDb({
          id: effectiveContentId,
          user_id: currentUser.id,
          media_url: accModalData.mediaUrl,
          media_type: accModalData.mediaType,
          scheduled_date: accScheduledDate,
          scheduled_time: accScheduledTime,
          status: "Scheduled"
        });
      } else {
        // Standalone media (no prior ACC): create new content_posts row
        const newPost = await savePostToDb({
          user_id: currentUser.id,
          title: accModalData.title,
          script: accModalData.caption || "",
          caption: accModalData.caption || "",
          hashtags: [],
          media_url: accModalData.mediaUrl,
          media_type: accModalData.mediaType,
          scheduled_date: accScheduledDate,
          scheduled_time: accScheduledTime,
          status: "Scheduled"
        });
        setActiveContentId(newPost.id);
      }

      setAccSuccessMsg("✅ Konten berhasil di-ACC & tersimpan di Perpustakaan Media & Kalender Konten!");
      setTimeout(() => {
        setAccSuccessMsg(null);
        setAccModalData(null);
      }, 2000);
    } catch (e) {
      console.error("Error saving ACC content:", e);
    }
  };

  const handleCreateNewChat = async () => {
    if (!currentUser) {
      setOpenAuthModal(true);
      return;
    }

    try {
      const newThread = await createConversation(currentUser.id, "Obrolan Baru");
      setConversations((prev) => [newThread, ...prev]);
      setActiveConvId(newThread.id);
      setMessages([]);
      setHasStarted(false);
      setActiveContentId(null);
    } catch (e) {
      console.error("Failed to create new conversation:", e);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (confirm("Hapus obrolan ini dari riwayat?")) {
      await deleteConversation(convId, currentUser.id);
      const updated = conversations.filter((c) => c.id !== convId);
      setConversations(updated);
      if (activeConvId === convId) {
        if (updated.length > 0) {
          selectConversation(updated[0].id, currentUser.id);
        } else {
          setActiveConvId(null);
          setMessages([]);
          setHasStarted(false);
        }
      }
    }
  };

  const initUserAndChat = async () => {
    setLoading(true);
    try {
      const u = await getCurrentUser();
      setCurrentUser(u);
      if (u) {
        await loadConversationsAndActiveThread(u.id, u.email, u);
      } else {
        setConversations([]);
        setActiveConvId(null);
        setMessages([]);
        setHasStarted(false);
      }
    } catch (e) {
      console.warn("Error initializing user:", e);
      setConversations([]);
      setActiveConvId(null);
      setMessages([]);
      setHasStarted(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && !loading) {
      handlePendingNewsContext(currentUser);
    }
  }, [currentUser, loading]);

  useEffect(() => {
    initUserAndChat();

    const handleAuthChange = () => {
      initUserAndChat();
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  useEffect(() => {
    getTopicRatios().then((r) => {
      if (r[0]) { setTopic1(r[0].topicName); setPct1(r[0].percentage); }
      if (r[1]) { setTopic2(r[1].topicName); setPct2(r[1].percentage); }
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowScrollDown(false);
    }
  }, [messages, isTyping]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 80);
  }

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }

  function copyToClipboard(text: string, idKey: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Loading Screen while checking Auth
  if (loading) {
    return (
      <main className="page-wrap flex min-h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="size-8 animate-spin text-primary" />
          <p className="text-xs font-semibold text-muted-foreground">Memuat Sparky AI...</p>
        </div>
      </main>
    );
  }

  // Lock State when user is logged out (Same as Content Planner)
  if (!currentUser && !loading) {
    return (
      <main className="page-wrap pb-16 pt-24 min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-blue-100/70 via-indigo-50/50 to-blue-50/80 dark:from-slate-950 dark:via-blue-950/30 dark:to-slate-950 px-4">
        <section className="mx-auto my-8 max-w-xl w-full overflow-hidden rounded-3xl border border-primary/20 bg-background/95 p-8 sm:p-10 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
            <Lock className="size-8 text-primary animate-pulse" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Sparky AI Agent Terkunci
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            Anda belum masuk (logged out). Silakan masuk atau daftar akun Anda untuk mulai mengobrol dengan Sparky AI Agent, mengakses fitur riset, dan menyimpan riwayat percakapan secara permanen.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => setOpenAuthModal(true)}
              className="w-full sm:w-auto rounded-xl bg-primary px-8 py-3 text-xs sm:text-sm font-bold text-primary-foreground shadow-lg transition-transform hover:scale-105"
            >
              <LogIn className="mr-2 size-4" /> Masuk / Daftar Akun
            </Button>
          </div>

          <div className="mt-7 pt-4 border-t border-border/60 flex items-center justify-center gap-2 text-[11px] text-muted-foreground font-semibold">
            <ShieldCheck className="size-4 text-emerald-500" /> Riwayat percakapan & konten tersimpan aman di akun Anda
          </div>
        </section>

        <AuthModal
          isOpen={openAuthModal}
          onClose={() => setOpenAuthModal(false)}
          onSuccess={(u) => {
            setCurrentUser(u);
            window.dispatchEvent(new Event("auth-changed"));
            initUserAndChat();
          }}
        />
      </main>
    );
  }

  // Date Grouping Helper for Sidebar
  const groupConversationsByDate = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);

    const groups: { [key: string]: ChatConversationItem[] } = {
      "Hari Ini": [],
      "Kemarin": [],
      "7 Hari Terakhir": [],
      "Lebih Lama": []
    };

    conversations.forEach((c) => {
      const cDate = new Date(c.updated_at || c.created_at);
      if (cDate.toDateString() === today.toDateString()) {
        groups["Hari Ini"].push(c);
      } else if (cDate.toDateString() === yesterday.toDateString()) {
        groups["Kemarin"].push(c);
      } else if (cDate >= last7Days) {
        groups["7 Hari Terakhir"].push(c);
      } else {
        groups["Lebih Lama"].push(c);
      }
    });

    return groups;
  };

  async function handleSend(customText?: string) {
    if (!currentUser) {
      setOpenAuthModal(true);
      return;
    }

    const textToSend = (customText || prompt).trim();
    if (!textToSend) return;

    setPrompt("");
    setHasStarted(true);

    let currentThreadId = activeConvId;

    // Create a conversation thread if logged in and none active
    if (currentUser && !currentThreadId) {
      const newConv = await createConversation(currentUser.id, textToSend.slice(0, 30));
      currentThreadId = newConv.id;
      setActiveConvId(newConv.id);
      setConversations((prev) => [newConv, ...prev]);
    }

    const userMsgId = crypto.randomUUID();
    const agentMsgId = crypto.randomUUID();

    const newMsg: ChatMessage = { id: userMsgId, role: "user", text: textToSend };
    setMessages((prev) => [...prev, newMsg]);
    setIsTyping(true);

    // Save User message & update title if first message
    if (currentUser && currentThreadId) {
      const isFirst = messages.length === 0;
      const titleUpdate = isFirst ? textToSend.slice(0, 32) : undefined;
      saveChatMessageToDb(currentUser.id, currentThreadId, "user", textToSend, undefined, titleUpdate);
      if (isFirst && titleUpdate) {
        setConversations((prev) =>
          prev.map((c) => (c.id === currentThreadId ? { ...c, title: titleUpdate } : c))
        );
      }
    }

    const lower = textToSend.toLowerCase();

    // 1. Extract selected news context from current conversation
    let currentNewsContext = "";
    const newsMsg = messages.find((m) => m.text.includes("📰 *Judul:*") || m.text.includes("Judul:"));
    if (newsMsg) {
      currentNewsContext = newsMsg.text;
    } else {
      const activeConv = conversations.find((c) => c.id === currentThreadId);
      if (activeConv && activeConv.title.startsWith("Ide: ")) {
        currentNewsContext = activeConv.title.replace(/^Ide:\s*/, "");
      }
    }
    const hasNewsContext = Boolean(currentNewsContext && currentNewsContext.trim().length > 0);

    // 2. Questions / discussions detection (to prevent false positives on video/image generation)
    const isDiscussionOrQuestion =
      lower.includes("?") ||
      lower.includes("menurutmu") ||
      lower.includes("menurut kamu") ||
      lower.includes("apakah") ||
      lower.includes("gimana") ||
      lower.includes("bagaimana") ||
      lower.includes("apa yang cocok") ||
      lower.includes("masih bagus") ||
      lower.includes("kenapa") ||
      lower.includes("mengapa") ||
      lower.includes("tips") ||
      lower.includes("saran");

    // 3. Explicit Video Action detection
    const isExplicitVideoAction =
      lower.includes("bikin video") ||
      lower.includes("buat video") ||
      lower.includes("buatkan video") ||
      lower.includes("generate video") ||
      lower.includes("produksi video") ||
      lower.includes("minta video") ||
      lower.includes("render video") ||
      lower.includes("bikin videonya") ||
      lower.includes("buat videonya") ||
      lower.includes("buatkan videonya") ||
      lower.includes("lanjut bikin video") ||
      lower.includes("lanjut bikin videonya") ||
      lower.includes("bikin reels") ||
      lower.includes("buat reels") ||
      lower.includes("buatkan reels") ||
      lower.includes("generate reels") ||
      lower.includes("produksi reels") ||
      lower.includes("bikin reel") ||
      lower.includes("buat reel") ||
      lower.includes("buatkan reel") ||
      lower.includes("generate reel") ||
      lower.includes("produksi reel") ||
      /(?:bikin|buat|buatkan|generate|produksi|minta|render)\s+(?:video|videonya|reel|reels)\b/i.test(lower);

    // 4. Explicit Image Action detection
    const isExplicitImageAction =
      lower.includes("bikin gambar") ||
      lower.includes("buat gambar") ||
      lower.includes("buatkan gambar") ||
      lower.includes("generate gambar") ||
      lower.includes("minta gambar") ||
      lower.includes("mana gambarnya") ||
      lower.includes("gambar kucing") ||
      lower.includes("bikin visual") ||
      lower.includes("buat visual") ||
      lower.includes("buatkan visual") ||
      lower.includes("generate visual") ||
      lower.includes("bikin foto") ||
      lower.includes("buat foto") ||
      lower.includes("buatkan foto") ||
      lower.includes("generate foto") ||
      /(?:bikin|buat|buatkan|generate|minta)\s+(?:gambar|gambarnya|visual|foto)\b/i.test(lower);

    // 5. Intent: Content Recommendation / Creation
    const isLegacyRecommendation =
      lower.includes("4 opsi") ||
      lower.includes("4 rekomendasi") ||
      lower.includes("rekomendasi konten") ||
      lower.includes("opsi konten") ||
      lower.includes("pilar konten") ||
      lower.includes("4 option") ||
      lower === "buatkan 4 opsi" ||
      lower.startsWith("buatkan 4 opsi");

    const isNaturalContentCreation =
      lower.includes("bikin konten") ||
      lower.includes("buat konten") ||
      lower.includes("buatkan konten") ||
      lower.includes("bikin ide konten") ||
      lower.includes("buat ide konten") ||
      lower.includes("buatkan ide konten") ||
      lower.includes("ide konten") ||
      lower.includes("konsep konten") ||
      lower.includes("buat konsep") ||
      lower.includes("buatkan konsep") ||
      lower.includes("bikin konsep") ||
      lower.includes("kembangkan jadi konten") ||
      lower.includes("jadikan konten") ||
      lower.includes("produksi konten") ||
      lower.includes("rancang konten") ||
      lower.includes("susun konten") ||
      lower.includes("kasih beberapa konsep") ||
      lower.includes("kasih ide konten") ||
      lower.includes("kasih konsep") ||
      lower.includes("beberapa konsep") ||
      /(?:bikin|buat|buatkan|kembangkan|mengembangkan|jadikan|produksi|rancang|susun|kasih)\b.*?\b(?:konten|kontennya|konsep)/i.test(lower);

    const isNewsFollowUpAction =
      hasNewsContext &&
      !isExplicitVideoAction &&
      !isExplicitImageAction &&
      (lower.includes("yuk kita bikin") ||
        lower.includes("coba kita bikin") ||
        lower.includes("lanjut bikin") ||
        lower.includes("kita kembangkan") ||
        lower.includes("coba kembangkan") ||
        lower.includes("lanjutkan") ||
        lower.includes("yuk produksi") ||
        lower.includes("buatkan dari berita ini") ||
        lower.includes("bikin dari berita ini") ||
        lower.includes("kembangkan berita ini") ||
        lower.includes("kembangkan ini") ||
        lower.includes("dari topik ini") ||
        lower.includes("dari topik tadi"));

    const isNewOptionsRequest =
      lower.includes("buatkan opsi lain") ||
      lower.includes("buat opsi lain") ||
      lower.includes("bikin opsi lain") ||
      lower.includes("kasih ide lain") ||
      lower.includes("kasih opsi lain") ||
      lower.includes("ganti opsi") ||
      lower.includes("cari ide lain") ||
      lower.includes("cari opsi lain") ||
      lower.includes("ide lain") ||
      lower.includes("opsi lain") ||
      lower.includes("opsi baru") ||
      lower.includes("ide baru");

    const isRecommendationRequest = isLegacyRecommendation || isNaturalContentCreation || isNewsFollowUpAction || isNewOptionsRequest;

    // 6. Intent: Video & Image (Priority: Recommendation -> Video -> Image)
    const isVideoRequest = !isRecommendationRequest && isExplicitVideoAction && !isDiscussionOrQuestion;
    const isImageRequest = !isRecommendationRequest && !isVideoRequest && isExplicitImageAction && !isDiscussionOrQuestion;

    const currentActiveContentId = activeContentId || getLatestContentId();
    const isRevisionRequest = Boolean(
      !isRecommendationRequest &&
      !isExplicitVideoAction &&
      !isExplicitImageAction &&
      (
        lower.includes("revisi") ||
        lower.includes("ubah caption") ||
        lower.includes("ganti caption") ||
        lower.includes("buat caption") ||
        lower.includes("bikin caption") ||
        lower.includes("ubah script") ||
        lower.includes("ganti script") ||
        lower.includes("revisi script") ||
        lower.includes("ubah skrip") ||
        lower.includes("ganti skrip") ||
        lower.includes("revisi skrip") ||
        lower.includes("ubah hook") ||
        lower.includes("ganti hook") ||
        lower.includes("revisi hook") ||
        lower.includes("buat lebih") ||
        lower.includes("bikin lebih") ||
        lower.includes("ubah konsep") ||
        lower.includes("ganti judul") ||
        lower.includes("ubah judul") ||
        lower.includes("perbaiki") ||
        /(?:ubah|ganti|revisi|buat|bikin)\b.*?\b(?:caption|script|skrip|hook|judul|scene)/i.test(lower)
      )
    );

    if (isRecommendationRequest) {
      const updatedRatios: TopicRatio[] = [
        { topicName: topic1, percentage: Number(pct1) },
        { topicName: topic2, percentage: Number(pct2) }
      ];
      await saveTopicRatios(updatedRatios);

      const generatedOptions = await generateFourContentOptions(updatedRatios, currentNewsContext);
      const agentText = `Berdasarkan pilar brand kamu (${pct1}% ${topic1} & ${pct2}% ${topic2}), berikut 4 opsi rekomendasi konten yang siap kamu evaluasi:`;

      const agentMsg: ChatMessage = {
        id: agentMsgId,
        role: "agent",
        text: agentText,
        type: "recommendation_cards",
        options: generatedOptions
      };

      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);

      if (currentUser && currentThreadId) {
        saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", agentText, {
          type: "recommendation_cards",
          options: generatedOptions
        });
      }
    } else if (isVideoRequest) {
      const currentContentId = activeContentId || getLatestContentId();

      if (!currentContentId) {
        const gateText = "Pilih dan ACC salah satu opsi konten di atas dulu yuk! Setelah itu Sparky siap langsung buatkan video sinematik yang sesuai dengan konsep pilihanmu. 🎬✨";
        const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: gateText, type: "general" };
        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", gateText, { type: "general" });
        }
        return;
      }

      const approvedMsg = messages.slice().reverse().find(
        (m) => (m.contentId === currentContentId || m.approvedData?.savedPostId === currentContentId) && m.approvedData
      );
      const approved = approvedMsg?.approvedData;
      const effectiveVidPrompt = approved?.videoPrompt || textToSend;
      const effectiveImgPrompt = approved?.imagePrompt || textToSend;
      const cleanTopic = approved?.title || textToSend.replace(/^(bikin|buatkan|buat|generate|minta|lanjut)\s+(video|videonya|reel)\s*/i, "").trim() || "Reel Sinematik";

      let resImg: { imageUrl: string; error?: string } = { imageUrl: "" };
      let resVid: { videoUrl: string; error?: string } = { videoUrl: "" };

      try {
        resImg = await generateNanoBananaImage({
          prompt: effectiveImgPrompt,
          aspectRatio: "9:16",
          contentId: currentContentId,
          topicTitle: cleanTopic,
          userId: currentUser?.id
        });
        resVid = await generateVeoVideo({
          prompt: effectiveVidPrompt,
          durationSeconds: 8,
          resolution: "720p",
          contentId: currentContentId,
          topicTitle: cleanTopic,
          userId: currentUser?.id
        });
      } catch (e: any) {
        console.error("Error generating video media:", e);
      }

      const hasValidVid = isValidMediaUrl(resVid.videoUrl);
      const hasValidImg = isValidMediaUrl(resImg.imageUrl);
      const finalMediaUrl = hasValidVid ? resVid.videoUrl : hasValidImg ? resImg.imageUrl : "";

      if (hasValidVid || hasValidImg) {
        const agentText = `🎬 **Hasil Produksi Video Reel (Google Veo 3.1)**:\n\n` +
          `📹 **Konsep Scene Script 8-Detik**:\n` +
          `• **[0-2s Hook]**: *"Tahukah kamu rahasia dibalik kekuatan ${cleanTopic}?"*\n` +
          `• **[2-5s Visual Utama]**: Kamera melakukan pan sinematik 3D close-up memperlihatkan detail visual ${cleanTopic} secara realistis.\n` +
          `• **[5-8s CTA & Closing]**: Teks overlay "Simpan & Follow untuk info menarik berikutnya!" dengan audio trending.\n\n` +
          `✨ **Prompt Visual Veo 3.1**: *"Cinematic 8-second vertical 9:16 video: High resolution detailed footage of ${cleanTopic}, 60fps, 35mm lens, studio lighting, smooth motion."*\n\n` +
          `👇 Putar video Reel 8-detik di bawah ini:`;

        const agentMsg: ChatMessage = {
          id: agentMsgId,
          role: "agent",
          text: agentText,
          type: "video_card",
          videoUrl: hasValidVid ? resVid.videoUrl : undefined,
          imageUrl: hasValidImg ? resImg.imageUrl : undefined,
          topicTitle: cleanTopic,
          contentId: currentContentId || undefined
        };

        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", agentText, {
            type: "video_card",
            videoUrl: hasValidVid ? resVid.videoUrl : undefined,
            imageUrl: hasValidImg ? resImg.imageUrl : undefined,
            topicTitle: cleanTopic,
            contentId: currentContentId || undefined
          });
        }

        // Target Flow: content_posts.media_url + media_type & user_media_library.post_id
        if (currentContentId && finalMediaUrl) {
          // 1. Update existing content_posts (NO duplicate!)
          await attachMediaToPost(
            currentContentId,
            finalMediaUrl,
            hasValidVid ? "video" : "image",
            currentUser?.id
          ).catch((err) => console.warn("Notice updating content_posts with media:", err));

          // 2. Save multiple media variations to user_media_library with the SAME post_id
          if (currentUser) {
            if (hasValidVid) {
              await saveMediaToLibrary(currentUser.id, {
                post_id: currentContentId,
                media_type: "video",
                media_url: resVid.videoUrl,
                title: `Video Reel ${cleanTopic}`,
                prompt: effectiveVidPrompt,
                status: "generated"
              }).catch((err) => console.warn("Notice saving video to media library:", err));
            }
            if (hasValidImg) {
              await saveMediaToLibrary(currentUser.id, {
                post_id: currentContentId,
                media_type: "image",
                media_url: resImg.imageUrl,
                title: `Thumbnail Visual ${cleanTopic}`,
                prompt: effectiveImgPrompt,
                status: "generated"
              }).catch((err) => console.warn("Notice saving thumbnail to media library:", err));
            }
          }
        } else if (!currentContentId && currentUser) {
          // Standalone generation without contentId: save to library without post_id
          if (hasValidVid) {
            saveMediaToLibrary(currentUser.id, {
              post_id: null,
              media_type: "video",
              media_url: resVid.videoUrl,
              title: `Video Reel ${cleanTopic}`,
              prompt: effectiveVidPrompt,
              status: "generated"
            }).catch((err) => console.warn("Notice saving standalone video:", err));
          }
        }
      } else {
        // Generation failure: DO NOT save fake URLs, DO NOT alter content_posts
        const errDetail = resVid.error || resImg.error;
        const failText = errDetail
          ? `⚠️ **Kendala Produksi Video (Google Veo 3.1)**:\n\n${errDetail}\n\n*Sparky tidak menggunakan data tiruan/fake media. Pastikan kuota/billing Gemini API aktif untuk mencoba kembali.*`
          : "Maaf, terjadi kendala saat memproduksi visual media. Silakan coba beberapa saat lagi.";
        const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: failText, type: "general" };
        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", failText, { type: "general" });
        }
      }
    } else if (isImageRequest) {
      const currentContentId = activeContentId || getLatestContentId();

      if (!currentContentId) {
        const gateText = "Pilih dan ACC salah satu opsi konten di atas dulu yuk! Setelah itu Sparky siap langsung buatkan visual gambar HD yang sesuai dengan konsep pilihanmu. 🎨✨";
        const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: gateText, type: "general" };
        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", gateText, { type: "general" });
        }
        return;
      }

      const approvedMsg = messages.slice().reverse().find(
        (m) => (m.contentId === currentContentId || m.approvedData?.savedPostId === currentContentId) && m.approvedData
      );
      const approved = approvedMsg?.approvedData;
      const effectiveImgPrompt = approved?.imagePrompt || textToSend;
      const cleanImgTopic = approved?.title || textToSend.replace(/^(bikin|buatkan|buat|generate|minta)\s+(gambar|foto|visual)\s*/i, "").trim() || "Visual HD";

      let resImg: { imageUrl: string; error?: string } = { imageUrl: "" };
      try {
        resImg = await generateNanoBananaImage({
          prompt: effectiveImgPrompt,
          aspectRatio: "4:5",
          contentId: currentContentId,
          topicTitle: cleanImgTopic,
          userId: currentUser?.id
        });
      } catch (e: any) {
        console.error("Error generating image media:", e);
      }

      const hasValidImg = isValidMediaUrl(resImg.imageUrl);

      if (hasValidImg) {
        const agentText = `Ini dia gambar visual HD buatan **Google Nano Banana Engine**! 🎨✨\n\nKlik tombol **Download Gambar** di bawah ini untuk menyimpannya ke perangkat Anda:`;

        const agentMsg: ChatMessage = {
          id: agentMsgId,
          role: "agent",
          text: agentText,
          type: "image_card",
          imageUrl: resImg.imageUrl,
          topicTitle: cleanImgTopic,
          contentId: currentContentId || undefined
        };

        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", agentText, {
            type: "image_card",
            imageUrl: resImg.imageUrl,
            topicTitle: cleanImgTopic,
            contentId: currentContentId || undefined
          });
        }

        // Target Flow: content_posts.media_url + media_type & user_media_library.post_id
        if (currentContentId) {
          // 1. Update existing content_posts (NO duplicate!)
          await attachMediaToPost(
            currentContentId,
            resImg.imageUrl,
            "image",
            currentUser?.id
          ).catch((err) => console.warn("Notice updating content_posts with image:", err));

          // 2. Save media record to user_media_library with post_id
          if (currentUser) {
            await saveMediaToLibrary(currentUser.id, {
              post_id: currentContentId,
              media_type: "image",
              media_url: resImg.imageUrl,
              title: `Gambar ${cleanImgTopic}`,
              prompt: effectiveImgPrompt,
              status: "generated"
            }).catch((err) => console.warn("Notice saving image to media library:", err));
          }
        }
      } else {
        // Generation failure: DO NOT save fake URLs, DO NOT alter content_posts
        const errDetail = resImg.error;
        const failText = errDetail
          ? `⚠️ **Kendala Produksi Gambar (Google Nano Banana)**:\n\n${errDetail}\n\n*Sparky tidak menggunakan data tiruan/fake media. Pastikan kuota/billing Gemini API aktif untuk mencoba kembali.*`
          : "Maaf, terjadi kendala saat memproduksi gambar visual. Silakan coba beberapa saat lagi.";
        const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: failText, type: "general" };
        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", failText, { type: "general" });
        }
      }
    } else if (isRevisionRequest) {
      const currentContentId = activeContentId || getLatestContentId();

      if (!currentContentId) {
        const gateText = "Belum ada draf konten aktif yang bisa direvisi nih. Pilih dan ACC salah satu opsi rekomendasi di atas dulu ya, setelah itu kita bisa sempurnakan bersama! ✍️";
        const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: gateText, type: "general" };
        setMessages((prev) => [...prev, agentMsg]);
        setIsTyping(false);

        if (currentUser && currentThreadId) {
          saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", gateText, { type: "general" });
        }
        return;
      }

      // 1. Fetch current active content from content_posts or approvedData
      let activePost: ContentPostItem | undefined;
      try {
        const posts = await fetchAllPostsFromDb(currentUser?.id, currentUser?.email);
        activePost = posts.find((p) => p.id === currentContentId);
      } catch (err) {
        console.warn("Notice fetching active post for revision:", err);
      }

      if (!activePost) {
        const approvedMsg = messages.slice().reverse().find(
          (m) => (m.contentId === currentContentId || m.approvedData?.savedPostId === currentContentId) && m.approvedData
        );
        if (approvedMsg?.approvedData) {
          const app = approvedMsg.approvedData;
          activePost = {
            id: currentContentId,
            user_id: currentUser?.id,
            title: app.title,
            concept: app.concept,
            script: app.script,
            caption: app.caption,
            hashtags: app.hashtags,
            image_prompt: app.imagePrompt,
            video_prompt: app.videoPrompt,
            media_url: app.mediaUrl,
            media_type: app.mediaType,
            status: "Draft"
          };
        }
      }

      if (!activePost) {
        activePost = {
          id: currentContentId,
          user_id: currentUser?.id,
          title: "Konten Instagram",
          script: "",
          caption: "",
          hashtags: [],
          status: "Draft"
        };
      }

      // 2. Call reviseContentWithAI
      const revised = await reviseContentWithAI(activePost, textToSend);

      // 3. Save to database with same ID (in-place update, status Draft)
      let updatedPost: ContentPostItem;
      try {
        updatedPost = await savePostToDb({
          id: currentContentId,
          user_id: currentUser?.id,
          title: revised.title,
          concept: revised.concept,
          script: revised.script,
          caption: revised.caption,
          hashtags: revised.hashtags,
          image_prompt: revised.image_prompt,
          video_prompt: revised.video_prompt,
          media_url: activePost.media_url,
          media_type: activePost.media_type,
          status: "Draft"
        });
      } catch (err) {
        console.warn("Notice saving revised post:", err);
        updatedPost = {
          ...activePost,
          ...revised,
          id: currentContentId,
          status: "Draft"
        };
      }

      // 4. Store approvedData for subsequent actions
      const approvedDataToStore: ApprovedContentPlan = {
        title: updatedPost.title,
        concept: updatedPost.concept || "",
        script: updatedPost.script,
        caption: updatedPost.caption,
        hashtags: updatedPost.hashtags || [],
        imagePrompt: updatedPost.image_prompt || "",
        videoPrompt: updatedPost.video_prompt || "",
        estimatedCost: "Rp 0 (Draft Plan)",
        mediaUrl: updatedPost.media_url,
        mediaType: updatedPost.media_type,
        savedPostId: currentContentId
      };

      // 5. Respond with revision summary
      const agentText = `✨ **Draf Konten Berhasil Direvisi!**\n\n${revised.summaryOfChanges}\n\n` +
        `📝 **Judul**: ${updatedPost.title}\n` +
        `🎬 **Skrip**: \n${updatedPost.script.length > 150 ? updatedPost.script.slice(0, 150) + "..." : updatedPost.script}\n\n` +
        `📋 **Caption**: \n${updatedPost.caption}\n\n` +
        `🏷️ **Hashtags**: ${(updatedPost.hashtags || []).join(" ")}\n\n` +
        `Status draf: **Draft** (Tersimpan di Content Planner). Kamu bisa minta revisi lagi, atau ketik **"bikin video"** / **"buatkan gambar"** untuk memproduksi visualnya!`;

      const agentMsg: ChatMessage = {
        id: agentMsgId,
        role: "agent",
        text: agentText,
        type: "plan_approval",
        approvedData: approvedDataToStore,
        contentId: currentContentId
      };

      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);

      if (currentUser && currentThreadId) {
        saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", agentText, {
          type: "plan_approval",
          approvedData: approvedDataToStore,
          contentId: currentContentId
        });
      }
    } else {
      const aiReply = await callGeminiApi({
        prompt: textToSend,
        systemInstruction: "You are Sparky, an AI Instagram Marketing Consultant. ALWAYS respond in VERY CONCISE, DIRECT, AND SHORT Indonesian (maximum 2-3 brief sentences). Be friendly, helpful, and get straight to the point without long disclaimers, repeated marketing speeches, or fluffy intros."
      });

      const agentMsg: ChatMessage = { id: agentMsgId, role: "agent", text: aiReply, type: "general" };
      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);

      if (currentUser && currentThreadId) {
        saveChatMessageToDb(currentUser.id, currentThreadId, "sparky", aiReply, { type: "general" });
      }
    }
  }

  async function handleACCApproval(msgId: string, option: ContentRecommendationOption) {
    if (!currentUser) {
      setOpenAuthModal(true);
      return;
    }

    setMessages((prev) =>
      prev.map((msg) => (msg.id === msgId ? { ...msg, isProcessingAcc: true } : msg))
    );

    try {
      const targetExistingId = activeContentId || undefined;
      const approvedResult = await approveAndGenerateContent(option, currentUser?.id, targetExistingId);
      const isReplacement = Boolean(targetExistingId);
      const updatedText = isReplacement
        ? `🔄 Konsep konten diperbarui ke "${option.title}"! Script video, caption, dan kalkulasi biaya telah disinkronkan ke Kalender Supabase.`
        : `✨ Topik "${option.title}" disetujui! Script video, caption, prompt visual Veo 3.1, dan kalkulasi biaya telah dibuat & tersimpan di Kalender Supabase.`;
      const contentId = approvedResult.savedPostId;

      setActiveContentId(contentId);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === msgId
            ? {
                ...msg,
                isProcessingAcc: false,
                approvedData: approvedResult,
                contentId: contentId,
                text: updatedText,
                options: (msg.options || []).map((o) => ({
                  ...o,
                  status: o.id === option.id ? ("approved" as const) : (o.status === "rejected" ? ("rejected" as const) : ("pending" as const))
                }))
              }
            : msg
        )
      );

      if (currentUser && activeConvId) {
        saveChatMessageToDb(currentUser.id, activeConvId, "sparky", updatedText, {
          approvedData: approvedResult,
          contentId: contentId
        });
      }
    } catch (e) {
      console.error("Error approving ACC item:", e);
      setMessages((prev) =>
        prev.map((msg) => (msg.id === msgId ? { ...msg, isProcessingAcc: false } : msg))
      );
    }
  }

  function handleRejectOption(msgId: string, optionId: string) {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId) return msg;
        const updatedOptions = (msg.options || []).map((o) =>
          o.id === optionId ? { ...o, status: "rejected" as const } : o
        );
        return {
          ...msg,
          options: updatedOptions
        };
      })
    );
  }

  function renderFormattedText(text: string) {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const lineContent = parts.map((part, pIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={pIdx} className="font-bold text-blue-700 dark:text-blue-300">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
        return (
          <div key={idx} className="flex items-start gap-2.5 my-1.5 pl-1">
            <span className="size-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
            <span className="leading-relaxed">{lineContent}</span>
          </div>
        );
      }

      if (/^\d+\.\s/.test(line.trim())) {
        return (
          <div key={idx} className="flex items-start gap-2 my-1.5 pl-1">
            <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">
              {line.trim().match(/^\d+\./)?.[0]}
            </span>
            <span className="leading-relaxed">{lineContent}</span>
          </div>
        );
      }

      return <p key={idx} className={line.trim() === "" ? "h-2" : "my-1 leading-relaxed"}>{lineContent}</p>;
    });
  }

  const groupedConvs = groupConversationsByDate();

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-gradient-to-b from-blue-100/70 via-indigo-50/50 to-blue-50/80 dark:from-slate-950 dark:via-blue-950/30 dark:to-slate-950">
      {/* ========================================= */}
      {/* 📚 LEFT CHAT HISTORY SIDEBAR (ChatGPT Style) */}
      {/* ========================================= */}
      <aside
        className={`fixed md:relative z-40 h-full w-72 shrink-0 border-r border-border/70 bg-background/95 backdrop-blur-xl shadow-xl transition-all duration-300 flex flex-col ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:-ml-72"
        }`}
      >
        {/* Sidebar Header & New Chat Button */}
        <div className="p-3.5 border-b border-border/60 flex items-center justify-between gap-2">
          <Button
            onClick={handleCreateNewChat}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-sm hover:scale-[1.02] transition"
          >
            <Plus className="size-4" />
            <span>Chat Baru</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="size-8 text-muted-foreground hover:bg-muted"
            title="Sembunyikan Sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Conversations History List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 no-scrollbar">
          {currentUser ? (
            conversations.length === 0 ? (
              <div className="text-center py-8 px-4 space-y-2">
                <MessageSquare className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-semibold text-muted-foreground">Belum ada riwayat chat.</p>
                <p className="text-[11px] text-muted-foreground/80">Mulai kirim ide konten pertama Anda di atas!</p>
              </div>
            ) : (
              Object.entries(groupedConvs).map(([groupTitle, list]) =>
                list.length > 0 ? (
                  <div key={groupTitle} className="space-y-1">
                    <span className="block px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {groupTitle}
                    </span>
                    {list.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => selectConversation(c.id)}
                        className={`group relative flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
                          activeConvId === c.id
                            ? "bg-primary/10 text-primary border border-primary/20 shadow-2xs font-bold"
                            : "text-foreground/80 hover:bg-muted/80 hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <MessageSquare className={`size-3.5 shrink-0 ${activeConvId === c.id ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="truncate text-xs">{c.title}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleDeleteConversation(c.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                          title="Hapus Obrolan"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null
              )
            )
          ) : (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center space-y-3 mt-4">
              <ShieldCheck className="size-7 text-primary mx-auto" />
              <p className="text-xs font-bold text-foreground">Riwayat Obrolan Terkunci</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Masuk ke akun Anda untuk menyimpan riwayat chat permanen seperti ChatGPT.
              </p>
              <Button
                onClick={() => setOpenAuthModal(true)}
                className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs"
              >
                <LogIn className="mr-1.5 size-3.5" /> Masuk / Daftar
              </Button>
            </div>
          )}
        </div>

        {/* Sidebar Footer User Info */}
        {currentUser && (
          <div className="p-3 border-t border-border/60 bg-muted/30">
            <div className="flex items-center gap-2 px-1">
              <span className="grid size-7 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{currentUser.name}</p>
                <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-0.5">
                  <ShieldCheck className="size-2.5" /> Supabase Library Active
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ========================================= */}
      {/* 💬 MAIN CHAT AREA                          */}
      {/* ========================================= */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden">
        {/* Toggle Sidebar Button Header Bar */}
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="absolute left-4 top-3 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-md backdrop-blur-md hover:bg-muted transition"
          >
            <PanelLeft className="size-4 text-primary" />
            <span>Buka Riwayat</span>
          </button>
        )}

        <div
          className={`flex w-full px-3 sm:px-4 pb-4 relative ${
            hasStarted
              ? "h-full flex-col overflow-hidden"
              : "h-full flex-col items-center justify-center"
          }`}
        >
          {/* Ambient Glow */}
          <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[450px] rounded-full bg-blue-400/20 blur-[130px] -z-10" />

          {/* Hero State when empty chat */}
          {!hasStarted && (
            <div className="agent-hero relative w-full max-w-2xl pt-4 sm:pt-8 pb-8 text-center animate-in fade-in zoom-in-95 duration-500">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/80 dark:border-blue-700/60 bg-blue-500/10 dark:bg-blue-900/40 px-4 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-5 shadow-xs backdrop-blur-md">
                <Sparkles className="size-3.5 animate-pulse text-blue-600 dark:text-blue-400" /> SPARKY AI · AUTONOMOUS INSTAGRAM AGENT
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                What are we creating today?
              </h1>
              <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto font-medium">
                Ubah ide ideasi kasar menjadi kampanye Instagram berkinerja tinggi. Didukung riset tren, generasi 4 opsi konten, hingga script video & kalender otomatis.
              </p>

              {/* Quick Action Chips */}
              <div className="mt-8 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-white/80 dark:bg-slate-900/80 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 shadow-sm transition hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
                  onClick={() => handleSend(`Buatkan 4 opsi rekomendasi konten dengan pilar ${pct1}% ${topic1} dan ${pct2}% ${topic2}`)}
                >
                  <Wand2 className="size-3.5 text-blue-600 dark:text-blue-400" /> 4 Opsi Rekomendasi Konten
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-white/80 dark:bg-slate-900/80 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 shadow-sm transition hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
                  onClick={() => handleSend("Bagaimana strategi meningkatkan engagement rate akun Instagram brand bulan ini?")}
                >
                  <TrendingUp className="size-3.5 text-blue-600 dark:text-blue-400" /> Strategi Pertumbuhan Engagement
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 dark:border-blue-800/60 bg-white/80 dark:bg-slate-900/80 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 shadow-sm transition hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
                  onClick={() => handleSend("Buatkan konsep script Reel 8 detik dengan hook emosional untuk produk terbaru")}
                >
                  <Clapperboard className="size-3.5 text-blue-600 dark:text-blue-400" /> Script Video & Reel Short-form
                </button>
              </div>

              {!currentUser && (
                <div className="mt-6 inline-flex flex-col sm:flex-row items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3 text-xs shadow-xs backdrop-blur-md">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <ShieldCheck className="size-4 text-primary shrink-0" />
                    <span>Silakan masuk atau daftar terlebih dahulu untuk memulai percakapan & menyimpan riwayat.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setOpenAuthModal(true)}
                    className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-xs hover:scale-105 transition"
                  >
                    <LogIn className="mr-1.5 size-3.5" /> Masuk / Daftar Akun
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Conversation Stream */}
          {hasStarted && (
            <div className="relative mx-auto flex w-full max-w-[860px] flex-1 min-h-0 flex-col">
              {/* Active Header Bar */}
              <div className="flex items-center justify-between rounded-2xl border border-blue-300/60 dark:border-blue-700/50 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 px-4 py-2.5 shadow-md mb-3 text-white">
                <div className="flex items-center gap-3">
                  <div className="relative flex size-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-md text-white shadow-inner border border-white/30">
                    <Sparkles className="size-4 text-blue-100" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold leading-none flex items-center gap-2 text-white">
                      Sparky AI Agent <span className="bg-white/20 text-white font-semibold text-[9px] py-0.5 px-2 rounded-full border border-white/30">Online</span>
                    </h3>
                    <p className="text-[10px] text-blue-100 mt-1 font-medium">Pilar Brand: {pct1}% {topic1} · {pct2}% {topic2}</p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateNewChat}
                  className="h-7 text-xs text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-full px-3 font-semibold transition"
                >
                  <Plus className="mr-1 size-3" /> Chat Baru
                </Button>
              </div>

              <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-4 pb-4 flex flex-col gap-5 no-scrollbar">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex w-full justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="inline-block max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-tr-xs bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 px-5 py-3 text-left text-xs sm:text-sm text-white shadow-md shadow-blue-500/20 border border-blue-400/30 font-medium leading-relaxed whitespace-pre-wrap">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="flex w-full justify-start items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 mt-0.5">
                        <Sparkles className="size-4 text-white" />
                      </div>

                      <div className="flex-1 max-w-[94%] sm:max-w-[90%] text-xs sm:text-sm leading-relaxed text-foreground bg-white/90 dark:bg-slate-900/90 border border-blue-200/90 dark:border-blue-800/60 rounded-2xl p-4 sm:p-5 shadow-md shadow-blue-500/5 backdrop-blur-md">
                        <div>{renderFormattedText(message.text)}</div>

                        {/* Inline Recommendation Cards (4 Options) */}
                        {message.type === "recommendation_cards" && message.options && (
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {message.options.map((opt, idx) => {
                              const isApproved = opt.status === "approved" || message.approvedData?.title === opt.title;
                              const isRejected = opt.status === "rejected";
                              const hasAnyApproved = message.options?.some((o) => o.status === "approved") || Boolean(message.approvedData);

                              return (
                                <div
                                  key={opt.id}
                                  className={`rounded-2xl border p-4 shadow-sm transition flex flex-col justify-between ${
                                    isApproved
                                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-md ring-1 ring-emerald-500/30"
                                      : isRejected
                                      ? "border-border/60 bg-muted/30 opacity-60"
                                      : "border-blue-200 dark:border-blue-800/60 bg-gradient-to-b from-blue-50/70 to-white dark:from-slate-900 dark:to-slate-950 hover:border-blue-400 hover:shadow-md"
                                  }`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className={`font-bold text-[10px] px-2.5 py-0.5 rounded-full shadow-xs ${
                                        isApproved ? "bg-emerald-600 text-white" : isRejected ? "bg-muted-foreground/30 text-muted-foreground" : "bg-blue-600 text-white"
                                      }`}>
                                        Opsi {String.fromCharCode(65 + idx)}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        {isApproved && (
                                          <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-300 dark:border-emerald-800">
                                            <CheckCircle2 className="size-2.5" /> Disetujui
                                          </span>
                                        )}
                                        {isRejected && (
                                          <span className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-semibold text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 border border-rose-200 dark:border-rose-900">
                                            <XCircle className="size-2.5" /> Ditolak
                                          </span>
                                        )}
                                        <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-semibold text-[10px] px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                          {opt.format}
                                        </span>
                                      </div>
                                    </div>
                                    <h4 className={`text-xs font-bold leading-snug ${isApproved ? "text-emerald-950 dark:text-emerald-200" : isRejected ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                      {opt.title}
                                    </h4>
                                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{opt.angle}</p>
                                  </div>

                                  <div className="mt-4 flex items-center justify-between border-t border-blue-100 dark:border-blue-900/50 pt-2.5">
                                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                      <TrendingUp className="size-3" /> {opt.estimatedReach}
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                      {isApproved ? (
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-100/70 dark:bg-emerald-950 px-2 py-1 rounded-md">
                                          <Check className="size-3" /> Tersimpan di Kalender
                                        </span>
                                      ) : isRejected ? (
                                        <span className="text-[10px] text-muted-foreground italic px-2 py-1">Opsi Ditolak</span>
                                      ) : (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-[10px] px-2 font-semibold text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                                            disabled={message.isProcessingAcc}
                                            onClick={() => handleRejectOption(message.id, opt.id)}
                                            title="Tolak opsi ini"
                                          >
                                            <XCircle className="mr-1 size-3 text-rose-500" /> Tolak
                                          </Button>
                                          <Button
                                            size="sm"
                                            className={`h-7 text-[10px] px-2.5 font-bold rounded-lg transition ${
                                              hasAnyApproved
                                                ? "bg-slate-700 hover:bg-slate-800 text-white"
                                                : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                                            }`}
                                            disabled={message.isProcessingAcc}
                                            onClick={() => handleACCApproval(message.id, opt)}
                                          >
                                            {message.isProcessingAcc ? (
                                              "Memproses..."
                                            ) : hasAnyApproved ? (
                                              "Ganti ke Opsi Ini"
                                            ) : (
                                              <>
                                                <CheckCircle2 className="mr-1 size-3 text-emerald-300" /> ACC & Jadwalkan
                                              </>
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Inline Generated Image Card (Google Nano Banana Engine) */}
                        {message.type === "image_card" && message.imageUrl && (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-800 bg-slate-900/5 dark:bg-slate-900 p-3 shadow-md">
                            <div className="relative aspect-[4/5] max-w-xs mx-auto overflow-hidden rounded-xl bg-slate-950 border border-border/60">
                              <img
                                src={message.imageUrl}
                                alt="Gambar Visual Google Nano Banana"
                                className="w-full h-full object-cover transition-transform hover:scale-105"
                              />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Sparkles className="size-3 text-blue-600" /> Google Nano Banana Engine (1080x1350)
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (!currentUser) { setOpenAuthModal(true); return; }
                                    setAccModalData({
                                      isOpen: true,
                                      contentId: message.contentId || activeContentId || undefined,
                                      mediaUrl: message.imageUrl!,
                                      mediaType: "image",
                                      title: message.topicTitle ? `Gambar ${message.topicTitle}` : "Gambar Visual Nano Banana",
                                      caption: "Visual Instagram HD hasil karya Google Nano Banana Engine. #InstaSpark"
                                    });
                                  }}
                                  className="h-7 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition hover:scale-105 active:scale-95"
                                >
                                  <CheckCircle2 className="mr-1 size-3.5" /> ACC & Jadwalkan
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => triggerDirectDownload(message.imageUrl!, "nano-banana-image.jpg")}
                                  className="h-7 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition hover:scale-105 active:scale-95"
                                >
                                  <Download className="mr-1 size-3.5" /> Download
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Inline Generated Video Card (Google Veo 3.1 Video Engine) */}
                        {message.type === "video_card" && (message.videoUrl || message.imageUrl) && (
                          <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 dark:border-blue-800 bg-slate-900/5 dark:bg-slate-900 p-3 shadow-md">
                            <div className="relative aspect-[9/16] max-w-[240px] mx-auto overflow-hidden rounded-2xl bg-slate-950 border border-border/80 shadow-2xl group">
                              {message.imageUrl ? (
                                <div className="relative w-full h-full overflow-hidden">
                                  <img
                                    src={message.imageUrl}
                                    alt="Google Veo 3.1 Visual Reel"
                                    className="w-full h-full object-cover transform scale-105 transition-transform duration-10000 ease-in-out hover:scale-110"
                                  />
                                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                                  <div className="absolute top-2 right-2 bg-red-600/90 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                                    <span className="size-1.5 rounded-full bg-white animate-ping" /> 00:08 Reel HD
                                  </div>
                                </div>
                              ) : (
                                <video
                                  src={message.videoUrl}
                                  controls
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover rounded-xl"
                                />
                              )}
                              <div className="pointer-events-none absolute inset-x-3 top-10 z-10 rounded-xl bg-black/65 backdrop-blur-md p-2.5 text-center text-white border border-white/20 shadow-md">
                                <span className="inline-block bg-blue-600 text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white mb-1">Reel Text Hook</span>
                                <p className="text-[11px] font-extrabold leading-tight text-white drop-shadow-md">
                                  "{message.topicTitle ? `Tahukah kamu rahasia dibalik ${message.topicTitle}?` : "Tahukah kamu rahasia dibalik visual sinematik ini?"}"
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Sparkles className="size-3 text-blue-600" /> Google Veo 3.1 Video Engine (9:16 HD Reel)
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (!currentUser) { setOpenAuthModal(true); return; }
                                    setAccModalData({
                                      isOpen: true,
                                      contentId: message.contentId || activeContentId || undefined,
                                      mediaUrl: message.imageUrl || message.videoUrl || "",
                                      mediaType: "video",
                                      title: message.topicTitle ? `Video Reel ${message.topicTitle}` : "Video Reel 8-Detik Sinematik",
                                      caption: `Konsep Video Reel Instagram 8-detik beranimasi sinematik 3D buatan Google Veo 3.1 untuk ${message.topicTitle || "konten brand Anda"}. #InstaSpark #Reels`
                                    });
                                  }}
                                  className="h-7 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition hover:scale-105 active:scale-95"
                                >
                                  <CheckCircle2 className="mr-1 size-3.5" /> ACC & Jadwalkan
                                </Button>
                                {message.imageUrl && (
                                  <Button
                                    size="sm"
                                    onClick={() => triggerDirectDownload(message.imageUrl!, "veo-3.1-reel-visual.jpg")}
                                    className="h-7 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm transition hover:scale-105 active:scale-95"
                                  >
                                    <Download className="mr-1 size-3.5" /> Visual HD
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (message.imageUrl) {
                                      const hookMsg = message.topicTitle ? `Tahukah kamu rahasia dibalik ${message.topicTitle}?` : "Tahukah kamu rahasia dibalik visual sinematik ini?";
                                      const videoBlobUrl = await create8SecondReelBlobUrl(message.imageUrl, hookMsg);
                                      triggerDirectDownload(videoBlobUrl, "veo-3.1-reel-8s.mp4");
                                    } else if (message.videoUrl) {
                                      triggerDirectDownload(message.videoUrl, "veo-3.1-reel-8s.mp4");
                                    }
                                  }}
                                  className="h-7 text-xs font-bold rounded-xl border-blue-300 text-blue-700 dark:text-blue-300 shadow-sm transition hover:scale-105 active:scale-95"
                                >
                                  <Download className="mr-1 size-3.5" /> Video (8s MP4)
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Approved Content Result Card with Explicit Scheduling Approval */}
                        {message.approvedData && (
                          <div className="mt-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/80 via-blue-50/60 to-white dark:from-slate-900 dark:via-blue-950/40 dark:to-slate-950 p-4 sm:p-5 space-y-4 text-xs shadow-md">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-900/60 pb-3">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Persetujuan Penjadwalan Konten</span>
                                <h4 className="text-xs sm:text-sm font-bold text-foreground">{message.approvedData.title}</h4>
                              </div>
                              <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                Disetujui & Siap Ditambahkan
                              </span>
                            </div>

                            {/* Script Video */}
                            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-4 relative group shadow-xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                  <Clapperboard className="size-3.5" /> Concept & Video Script (Reel)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(message.approvedData!.script, `script-${message.id}`)}
                                  className="text-[10px] text-blue-600 font-semibold hover:bg-blue-50 flex items-center gap-1 bg-blue-50/80 px-2 py-0.5 rounded-md transition border border-blue-100"
                                >
                                  {copiedId === `script-${message.id}` ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                                  {copiedId === `script-${message.id}` ? "Tersalin" : "Salin Script"}
                                </button>
                              </div>
                              <pre className="whitespace-pre-wrap font-sans text-xs text-foreground leading-relaxed">{message.approvedData.script}</pre>
                            </div>

                            {/* Caption & Hashtags */}
                            <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-4 relative group shadow-xs">
                              <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                  <Layers className="size-3.5" /> Caption & Hashtags Instagram
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(`${message.approvedData!.caption}\n\n${message.approvedData!.hashtags.join(" ")}`, `caption-${message.id}`)}
                                  className="text-[10px] text-blue-600 font-semibold hover:bg-blue-50 flex items-center gap-1 bg-blue-50/80 px-2 py-0.5 rounded-md transition border border-blue-100"
                                >
                                  {copiedId === `caption-${message.id}` ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                                  {copiedId === `caption-${message.id}` ? "Tersalin" : "Salin Caption"}
                                </button>
                              </div>
                              <p className="whitespace-pre-wrap text-xs text-foreground mb-3 leading-relaxed">{message.approvedData.caption}</p>
                              <div className="flex flex-wrap gap-1">
                                {message.approvedData.hashtags.map((tag) => (
                                  <span key={tag} className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium text-[10px] px-2 py-0.5 rounded-full">{tag}</span>
                                ))}
                              </div>
                            </div>

                            {/* Veo 3.1 & Visual Prompts */}
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-3.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Veo 3.1 Video Gen Prompt</span>
                                  <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center"><DollarSign className="size-3" /> {message.approvedData.formattedVeoCostIDR}</span>
                                </div>
                                <p className="text-[11px] italic text-muted-foreground leading-snug">"{message.approvedData.videoPrompt}"</p>
                              </div>

                              <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-900 p-3.5">
                                <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Nano Banana Visual Prompt</span>
                                <p className="mt-1.5 text-[11px] italic text-muted-foreground leading-snug">"{message.approvedData.imagePrompt}"</p>
                              </div>
                            </div>

                            {/* Direct Approval & Scheduling Control Box */}
                            <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3.5 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                                <div>
                                  <p className="font-bold text-foreground text-xs">Persetujuan Tambah ke Kalender</p>
                                  <p className="text-[11px] text-muted-foreground">Jadwal Default: <strong className="text-foreground">Hari Ini ({getTodayLocalDateString()}) jam 18:00 WIB</strong></p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => navigate({ to: "/planner" })}
                                className="rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:scale-105 transition"
                              >
                                <Check className="mr-1.5 size-4" /> Persetujuan & Lihat di Kalender
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}

                {isTyping && (
                  <div className="flex w-full justify-start items-center gap-3 animate-in fade-in">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
                      <Sparkles className="size-4 animate-spin text-white" />
                    </div>
                    <div className="rounded-full bg-white/80 dark:bg-slate-900/80 border border-blue-200 dark:border-blue-800 px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-300 flex items-center gap-2 shadow-xs backdrop-blur-md">
                      <span className="size-2 rounded-full bg-blue-600 animate-ping" />
                      Sparky sedang menyusun jawaban & meriset...
                    </div>
                  </div>
                )}
              </div>

              {showScrollDown && (
                <button
                  type="button"
                  aria-label="Scroll to bottom"
                  onClick={scrollToBottom}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex size-9 items-center justify-center rounded-full border-2 border-blue-500/40 bg-surface-raised shadow-lg text-foreground transition-all hover:bg-blue-500/20 hover:scale-110"
                >
                  <ArrowDown className="size-4 text-blue-600 dark:text-blue-400" />
                </button>
              )}
            </div>
          )}

          {/* Floating Input Bar */}
          <div className="mx-auto w-full max-w-xl shrink-0 mt-auto pt-2 z-10">
            {hasStarted && (
              <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar justify-center">
                <button
                  type="button"
                  onClick={() => handleSend("Buatkan 4 opsi rekomendasi konten")}
                  className="rounded-full px-3.5 py-1.5 text-xs font-semibold bg-white/90 dark:bg-slate-900/90 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs hover:bg-blue-600 hover:text-white transition shrink-0 cursor-pointer backdrop-blur-md"
                >
                  ✨ 4 Opsi Konten
                </button>
                <button
                  type="button"
                  onClick={() => handleSend("Rekomendasi jam posting terbaik")}
                  className="rounded-full px-3.5 py-1.5 text-xs font-semibold bg-white/90 dark:bg-slate-900/90 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs hover:bg-blue-600 hover:text-white transition shrink-0 cursor-pointer backdrop-blur-md"
                >
                  ⏱️ Jam Posting
                </button>
                <button
                  type="button"
                  onClick={() => handleSend("Tips meningkatkan engagement Reels")}
                  className="rounded-full px-3.5 py-1.5 text-xs font-semibold bg-white/90 dark:bg-slate-900/90 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-xs hover:bg-blue-600 hover:text-white transition shrink-0 cursor-pointer backdrop-blur-md"
                >
                  📈 Tips Reels FYP
                </button>
              </div>
            )}

            {showRatioSettings && (
              <div className="mb-3 rounded-2xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-4 shadow-xl animate-in fade-in text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <SlidersHorizontal className="size-4" /> Konfigurasi Pilar Brand Topik
                  </span>
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowRatioSettings(false)}>✕</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Topik Utamakan ({pct1}%)</label>
                    <input className="w-full rounded-lg border border-border px-2.5 py-1.5 bg-background text-xs" value={topic1} onChange={(e) => setTopic1(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Topik Pendukung ({pct2}%)</label>
                    <input className="w-full rounded-lg border border-border px-2.5 py-1.5 bg-background text-xs" value={topic2} onChange={(e) => setTopic2(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Input Bar */}
            <div className="flex items-end gap-2.5 rounded-3xl border border-blue-300/80 dark:border-blue-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-4 py-3 shadow-lg shadow-blue-500/10 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-400/20">
              <button
                type="button"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-700 transition p-1 cursor-pointer"
                title="Konfigurasi Rasio Topik Brand"
                onClick={() => setShowRatioSettings(!showRatioSettings)}
              >
                <SlidersHorizontal className="size-4" />
              </button>

              <Textarea
                aria-label="Marketing request"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Tanyakan konsep atau ketik 'buatkan 4 opsi'..."
                rows={1}
                className="min-h-[24px] max-h-32 flex-1 resize-none border-0 bg-transparent p-0 text-xs sm:text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 font-medium text-foreground"
              />
              <Button
                aria-label="Send request"
                size="icon"
                className="size-8 shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:scale-105 active:scale-95 transition-transform font-bold"
                disabled={!prompt.trim() || isTyping}
                onClick={() => handleSend()}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>

            <p className="mt-2 text-center text-[10px] font-semibold text-muted-foreground">
              Sparky AI Agent v2.5 · Powered by Gemini, Veo 3.1 & Supabase
            </p>
          </div>
        </div>
      </main>

      {/* ACC Scheduling Dialog Modal */}
      {accModalData && accModalData.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-background p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" /> ACC & Jadwalkan Konten
              </h3>
              <button onClick={() => setAccModalData(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            {accSuccessMsg ? (
              <div className="p-4 text-center space-y-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="size-8 text-emerald-600 mx-auto animate-bounce" />
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{accSuccessMsg}</p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/40">
                  <div className="size-14 rounded-lg bg-slate-950 overflow-hidden shrink-0">
                    <img src={accModalData.mediaUrl} alt="Media preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-foreground line-clamp-1">{accModalData.title}</h4>
                    <span className="inline-block bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">
                      {accModalData.mediaType === "video" ? "📹 Video Reel 8s" : "🖼️ Foto Visual HD"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-foreground">Tanggal Posting Instagram</label>
                  <input
                    type="date"
                    value={accScheduledDate}
                    onChange={(e) => setAccScheduledDate(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 bg-background text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-foreground">Jam Posting Terbaik</label>
                  <input
                    type="time"
                    value={accScheduledTime}
                    onChange={(e) => setAccScheduledTime(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2 bg-background text-xs font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-foreground">Caption Konten</label>
                  <textarea
                    rows={3}
                    value={accModalData.caption}
                    onChange={(e) => setAccModalData({ ...accModalData, caption: e.target.value })}
                    className="w-full rounded-xl border border-border px-3 py-2 bg-background text-xs resize-none font-medium"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAccModalData(null)} className="rounded-xl text-xs font-semibold">
                    Batal
                  </Button>
                  <Button size="sm" onClick={handleSaveAccToPlanner} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md">
                    Simpan & Jadwalkan
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AuthModal
        isOpen={openAuthModal}
        onClose={() => setOpenAuthModal(false)}
        onSuccess={(u) => {
          setCurrentUser(u);
          window.dispatchEvent(new Event("auth-changed"));
          initUserAndChat();
        }}
      />
    </div>
  );
}
