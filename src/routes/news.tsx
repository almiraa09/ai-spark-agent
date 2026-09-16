import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Flame, RefreshCw, Globe, Sparkles, Newspaper, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getLatestDailyBrief,
  refreshDailyBriefServerFn,
  type DailyBrief,
  type DailyNewsItem,
  type SelectedNewsContext,
  SELECTED_NEWS_CONTEXT_KEY
} from "@/services/news-service";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Daily Marketing Intelligence — Sparky" },
      { name: "description", content: "Daily brief tren pemasaran Instagram dan berita industri terkurasi." },
      { property: "og:title", content: "Daily Marketing Intelligence — Sparky" },
    ],
  }),
  component: NewsPage,
});

export function NewsPage() {
  const navigate = useNavigate();
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNewsId, setSelectedNewsId] = useState<string | null>(null);

  async function loadBrief() {
    setLoading(true);
    setError(null);
    try {
      const data = await getLatestDailyBrief();
      setBrief(data);
    } catch (e: any) {
      console.error("Failed to load daily brief:", e);
      setError("Daily brief belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshBrief() {
    setLoading(true);
    setError(null);
    try {
      const res = await refreshDailyBriefServerFn({ data: { force: true } });
      if (res.success && res.brief) {
        setBrief(res.brief);
      } else {
        setError(res.error || "Gagal memperbarui daily brief.");
      }
    } catch (e: any) {
      console.error("Failed to refresh daily brief:", e);
      setError(e?.message || "Terjadi kesalahan saat memperbarui daily brief.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBrief();
  }, []);

  function handleNewsSelect(news: DailyNewsItem) {
    setSelectedNewsId(news.id);
    if (typeof window !== "undefined") {
      const payload: SelectedNewsContext = {
        id: news.id,
        title: news.title,
        source: news.source,
        url: news.url || "",
        published_at: news.published_at || "",
        excerpt: news.excerpt || "",
        topic: news.topic || "",
        timestamp: Date.now(),
      };
      try {
        sessionStorage.setItem(SELECTED_NEWS_CONTEXT_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to store selected news context:", e);
      }
    }
    navigate({ to: "/" });
  }

  function formatPublishedDate(dateStr: string) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    } catch {}
    return dateStr;
  }

  const topics = brief?.topics?.slice(0, 3) || [];
  const newsItems = brief?.news_items?.slice(0, 5) || [];
  const hasContent = Boolean(brief && (topics.length > 0 || newsItems.length > 0));

  return (
    <main className="page-wrap pb-16">
      {/* Executive Header (Mempertahankan Header Existing) */}
      <header className="page-heading">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary mb-3">
            <Globe className="size-3.5" /> GLOBAL MARKETING INTELLIGENCE
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Real-Time Industry News & Trends</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Pantau perkembangan algoritma Instagram, strategi Reels, dan tren pemasaran digital terkini dari berbagai kawasan dunia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshBrief} disabled={loading}>
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} /> Perbarui Brief
          </Button>
        </div>
      </header>

      {/* Daily Notification Intro Text */}
      <section className="mb-8">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex items-start gap-3.5 text-foreground shadow-xs">
          <div className="mt-0.5 rounded-xl bg-primary/15 p-2 text-primary shrink-0">
            <Sparkles className="size-4" />
          </div>
          <div className="text-xs sm:text-sm leading-relaxed">
            <p className="font-semibold text-foreground">
              Hai, ini adalah berita dan topik terhangat terbaru yang aku siapkan untuk kamu. Brief ini diperbarui otomatis setiap pagi pukul 08.00.
            </p>
            {brief?.brief_date && (
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap font-medium">
                <span>📅 Edisi: {brief.brief_date}</span>
                {brief.updated_at && (
                  <>
                    <span>•</span>
                    <span>
                      🕒 Terakhir diperbarui:{" "}
                      {new Date(brief.updated_at).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      WIB
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* State Handlers */}
      {loading ? (
        <section className="panel p-16 text-center space-y-3">
          <RefreshCw className="mx-auto size-7 animate-spin text-primary" />
          <p className="text-sm font-semibold text-foreground">Menyiapkan daily brief...</p>
          <p className="text-xs text-muted-foreground">Sedang mengambil ringkasan berita pemasaran dan tren terkini.</p>
        </section>
      ) : error ? (
        <section className="panel p-12 text-center space-y-3 border-destructive/20 bg-destructive/5">
          <AlertCircle className="mx-auto size-7 text-destructive" />
          <p className="text-sm font-bold text-foreground">{error}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Terjadi kendala saat memuat data Daily Brief terbaru.
          </p>
          <Button variant="outline" size="sm" onClick={handleRefreshBrief} disabled={loading} className="rounded-full text-xs">
            Coba Lagi
          </Button>
        </section>
      ) : !hasContent ? (
        <section className="panel p-12 text-center space-y-3">
          <Newspaper className="mx-auto size-8 text-muted-foreground" />
          <p className="text-sm font-bold text-foreground">Daily brief belum tersedia.</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Brief harian belum dibuat untuk hari ini. Brief diperbarui otomatis setiap pagi pukul 08.00.
          </p>
          <Button variant="outline" size="sm" onClick={handleRefreshBrief} disabled={loading} className="rounded-full text-xs">
            <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} /> Perbarui Brief
          </Button>
        </section>
      ) : (
        <>
          {/* Section 1: Trending Topics (Tepat 3 Topik) */}
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="size-4 text-primary" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Topik Diskusi Terhangat Hari Ini (3 Tren Utama)
              </h2>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-3">
              {topics.map((item, idx) => (
                <div
                  key={item.rank || idx}
                  className="panel flex flex-col justify-between border-primary/20 hover:border-primary/50 transition p-4 sm:p-5 shadow-2xs"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="tiny-pill border-0 bg-primary/10 text-primary font-bold">
                        {item.tag || "Trends"}
                      </span>
                      <span className="font-display text-xs font-bold text-muted-foreground">
                        {item.rank || `0${idx + 1}`}
                      </span>
                    </div>
                    <h3 className="text-xs sm:text-sm font-bold leading-snug text-foreground">
                      {item.topic}
                    </h3>
                  </div>
                  <div className="mt-4 border-t border-border/60 pt-2.5 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{item.growth}</span>
                    {item.region && (
                      <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                        <Globe className="size-3" /> {item.region}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 2: News Feed (List Vertikal Tepat 5 Berita) */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Newspaper className="size-4 text-primary" />
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Berita Industri Pilihan Hari Ini (5 Berita Terkini)
              </h2>
            </div>

            <div className="space-y-3.5">
              {newsItems.map((news, index) => {
                const isSelected = selectedNewsId === news.id;
                return (
                  <div
                    key={news.id || index}
                    className={`panel group relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-5 transition hover:border-primary/50 hover:shadow-sm ${
                      isSelected ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    {/* Left Index & Details */}
                    <div className="flex items-start gap-3.5 sm:gap-4 flex-1 min-w-0">
                      <div className="flex flex-col items-center justify-center shrink-0 pt-0.5">
                        <span className="text-[10px] font-extrabold text-primary tracking-wider uppercase bg-primary/10 rounded-md px-2 py-1">
                          NEWS 0{index + 1}
                        </span>
                      </div>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                          <span className="font-bold text-foreground">{news.source}</span>
                          {news.topic && (
                            <>
                              <span>•</span>
                              <span className="font-semibold text-primary">{news.topic}</span>
                            </>
                          )}
                          {news.published_at && (
                            <>
                              <span>•</span>
                              <span>{formatPublishedDate(news.published_at)}</span>
                            </>
                          )}
                          {news.read_time && (
                            <>
                              <span>•</span>
                              <span>{news.read_time}</span>
                            </>
                          )}
                        </div>

                        <a
                          href={news.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block font-bold text-xs sm:text-sm leading-snug text-foreground group-hover:text-primary transition line-clamp-2"
                        >
                          {news.title}
                        </a>

                        {news.excerpt && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {news.excerpt}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Thumbnail + Arrow Button */}
                    <div className="flex items-center justify-between sm:justify-end gap-3.5 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                      <NewsCardThumbnail
                        url={news.image_url || (news as any).imageUrl}
                        title={news.title}
                        articleUrl={news.url}
                      />
                      <Button
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleNewsSelect(news)}
                        className="rounded-full size-9 p-0 flex items-center justify-center border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-all group-hover:scale-105 shrink-0"
                        title="Diskusikan berita ini dengan Sparky AI Agent"
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function NewsCardThumbnail({
  url,
  title,
  articleUrl,
}: {
  url?: string;
  title: string;
  articleUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const cleanUrl = typeof url === "string" ? url.trim() : "";
  const isValid =
    Boolean(cleanUrl) &&
    (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) &&
    !cleanUrl.toLowerCase().includes("placeholder") &&
    !cleanUrl.includes("undefined") &&
    !cleanUrl.includes("null");

  if (!isValid || imageFailed) {
    return (
      <div
        className="w-28 sm:w-36 h-20 sm:h-24 rounded-xl shrink-0 bg-muted/20 border border-border/40 flex flex-col items-center justify-center text-muted-foreground/40 select-none transition-colors group-hover:border-primary/30 group-hover:bg-muted/30"
        title="Gambar artikel tidak tersedia"
      >
        <Newspaper className="size-5 sm:size-6 stroke-[1.25] text-muted-foreground/35" />
        <span className="text-[9px] sm:text-[10px] mt-1 font-semibold text-muted-foreground/40 tracking-wider uppercase">
          News
        </span>
      </div>
    );
  }

  const imageElement = (
    <div className="relative w-28 sm:w-36 h-20 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-muted/40 border border-border/40 shadow-2xs">
      <img
        src={cleanUrl}
        alt={title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    </div>
  );

  if (articleUrl) {
    return (
      <a
        href={articleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block shrink-0 focus:outline-hidden"
        title={`Buka artikel: ${title}`}
        tabIndex={-1}
      >
        {imageElement}
      </a>
    );
  }

  return imageElement;
}
