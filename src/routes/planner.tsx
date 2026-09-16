import { useMemo, useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, RefreshCw, Clapperboard, Layers, DollarSign, Check, Copy, Sparkles, Filter, LayoutGrid, List, Lock, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllPostsFromDb, savePostToDb, deletePostFromDb, ContentPostItem, getCurrentUser, UserSession } from "@/lib/supabase";
import { AuthModal } from "@/components/auth-modal";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Content Planner — Sparky" },
      { name: "description", content: "Kalender editorial konten terintegrasi dengan Supabase DB & Sparky AI." },
      { property: "og:title", content: "Content Planner — Sparky" },
    ],
  }),
  component: PlannerPage,
});

type Status = "Draft" | "Scheduled" | "Published";
type StatusFilter = "Semua" | Status;

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

const emptyDraft = (date: string, userId?: string): ContentPostItem => ({
  id: "",
  user_id: userId,
  title: "",
  script: "",
  caption: "",
  hashtags: [],
  scheduled_date: date,
  scheduled_time: "18:00",
  status: "Draft"
});

export function PlannerPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [openAuthModal, setOpenAuthModal] = useState(false);
  const [posts, setPosts] = useState<ContentPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [draft, setDraft] = useState<ContentPostItem | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New Filters & View Toggles
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Semua");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const checkUserAndLoadPosts = async () => {
    setLoading(true);
    try {
      const u = await getCurrentUser();
      setCurrentUser(u);
      if (u) {
        const data = await fetchAllPostsFromDb(u.id, u.email);
        setPosts(data);
      } else {
        setPosts([]);
      }
    } catch (e) {
      console.error("Failed to load user/posts:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUserAndLoadPosts();

    const handleAuthChange = () => {
      checkUserAndLoadPosts();
    };

    window.addEventListener("auth-changed", handleAuthChange);
    return () => window.removeEventListener("auth-changed", handleAuthChange);
  }, []);

  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const lead = (first.getDay() + 6) % 7;
    const total = new Date(view.year, view.month + 1, 0).getDate();
    const list: Array<number | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= total; d++) list.push(d);
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [view]);

  const filteredPosts = useMemo(() => {
    if (statusFilter === "Semua") return posts;
    return posts.filter((p) => p.status === statusFilter);
  }, [posts, statusFilter]);

  // Total Summary Stats
  const totalVeoCostIDR = useMemo(() => {
    return posts.reduce((sum, p) => sum + (p.veo_cost_idr || 0), 0);
  }, [posts]);

  const statusCounts = useMemo(() => {
    const draftCount = posts.filter((p) => p.status === "Draft").length;
    const scheduledCount = posts.filter((p) => p.status === "Scheduled").length;
    const publishedCount = posts.filter((p) => p.status === "Published").length;
    return { draftCount, scheduledCount, publishedCount };
  }, [posts]);

  // Lock State when user is logged out
  if (!currentUser && !loading) {
    return (
      <main className="page-wrap pb-16">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Content Planner (Supabase DB)</p>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">Kelola Jadwal Postingan</h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Rencanakan, kelola, dan publikasikan konten Instagram terhubung langsung dengan ide disetujui dari Sparky AI Agent & Supabase.
            </p>
          </div>
        </header>

        <section className="mx-auto my-8 max-w-xl overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/5 via-background to-background p-8 text-center shadow-xl backdrop-blur-md">
          <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
            <Lock className="size-8" />
          </div>

          <h2 className="text-xl font-bold text-foreground">Content Planner Terkunci</h2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
            Anda telah keluar (logged out). Silakan masuk ke akun Anda untuk mengakses, menyimpan, dan mengedit jadwal postingan Instagram secara aman.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => setOpenAuthModal(true)}
              className="w-full sm:w-auto rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-md transition-transform hover:scale-105"
            >
              <LogIn className="mr-2 size-4" /> Masuk / Daftar Akun
            </Button>
          </div>

          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-center gap-2 text-[11px] text-muted-foreground font-medium">
            <ShieldCheck className="size-3.5 text-emerald-500" /> Data tersimpan aman & terisolasi di Supabase DB Anda
          </div>
        </section>

        <AuthModal
          isOpen={openAuthModal}
          onClose={() => setOpenAuthModal(false)}
          onSuccess={(u) => {
            setCurrentUser(u);
            checkUserAndLoadPosts();
          }}
        />
      </main>
    );
  }

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    setLoading(true);
    try {
      const postToSave = { ...draft, user_id: currentUser?.id };
      if (!postToSave.id) {
        delete (postToSave as any).id;
      }
      const saved = await savePostToDb(postToSave);
      setPosts((prev) => (draft.id ? prev.map((p) => (p.id === draft.id ? saved : p)) : [saved, ...prev]));
      setDraft(null);
    } catch (e) {
      console.error("Error saving post:", e);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try {
      await deletePostFromDb(id, currentUser?.id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error("Error deleting post:", e);
    } finally {
      setLoading(false);
    }
  };

  function copyToClipboard(text: string, fieldKey: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <main className="page-wrap pb-16">
      {/* Header Title Section */}
      <header className="page-heading">
        <div>
          <p className="eyebrow">Content Planner (Supabase DB)</p>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">Kelola Jadwal Postingan</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Kelola jadwal postingan Instagram, terhubung langsung dengan ide disetujui dari Sparky AI Agent & Supabase.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={checkUserAndLoadPosts} disabled={loading} className="rounded-full text-xs font-semibold">
            <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDraft(emptyDraft(iso(view.year, view.month, 1), currentUser?.id))} className="rounded-full text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md">
            <Plus className="mr-1 size-3.5" /> Konten Baru
          </Button>
        </div>
      </header>

      {/* Feature 1: Header Summary Cards Bar */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold text-muted-foreground">Total Postingan</p>
          <strong className="mt-1 block text-xl font-extrabold text-foreground">{posts.length} Post</strong>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Supabase Connected</span>
        </div>

        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white/90 dark:bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold text-muted-foreground">Est. Biaya Generasi Veo 3.1</p>
          <strong className="mt-1 block text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
            Rp{totalVeoCostIDR.toLocaleString("id-ID")}
          </strong>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Total Anggaran AI Video</span>
        </div>

        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold text-muted-foreground">Status Scheduled</p>
          <strong className="mt-1 block text-xl font-extrabold text-blue-600 dark:text-blue-400">{statusCounts.scheduledCount} Post</strong>
          <span className="text-[10px] text-muted-foreground font-medium">Siap Tayang</span>
        </div>

        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 p-4 shadow-sm backdrop-blur-md">
          <p className="text-[11px] font-semibold text-muted-foreground">Draft & Published</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{statusCounts.draftCount} Draft</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{statusCounts.publishedCount} Published</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">Status Manajemen Konten</span>
        </div>
      </section>

      <div className="space-y-4">
          {/* Feature 2 & 3: Filter Pills Bar & View Switcher */}
          <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-white/80 dark:bg-slate-900/80 p-3 shadow-xs backdrop-blur-md">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-xs font-semibold text-muted-foreground mr-1.5 flex items-center gap-1">
            <Filter className="size-3.5 text-blue-600 dark:text-blue-400" /> Filter:
          </span>
          {(["Semua", "Scheduled", "Draft", "Published"] as StatusFilter[]).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                statusFilter === st
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-slate-700"
              }`}
            >
              {st} {st !== "Semua" && `(${posts.filter((p) => p.status === st).length})`}
            </button>
          ))}
        </div>

        {/* View Mode Toggle Button (Grid vs List) */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              viewMode === "grid" ? "bg-background text-blue-600 dark:text-blue-400 shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="size-3.5" /> Kalender
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              viewMode === "list" ? "bg-background text-blue-600 dark:text-blue-400 shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="size-3.5" /> Daftar (List)
          </button>
        </div>
      </section>

      {/* Main Content Area (Calendar Grid or List View) */}
      {viewMode === "grid" ? (
        <section className="panel overflow-x-auto p-0 rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 shadow-md backdrop-blur-md">
          {/* Month Navigation Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-blue-50/80 via-white to-blue-50/80 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                <CalendarDays className="size-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">Kalender Editorial Sparky AI</p>
                <h2 className="text-base sm:text-lg font-extrabold text-foreground">
                  {MONTHS[view.month]} {view.year}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Bulan sebelumnya" onClick={() => shift(-1)} className="rounded-full">
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" aria-label="Bulan berikutnya" onClick={() => shift(1)} className="rounded-full">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Days Header */}
          <div className="grid min-w-[850px] grid-cols-7 border-b border-border bg-muted/40">
            {DAYS.map((d) => (
              <div key={d} className="p-3 text-center">
                <span className="text-xs font-bold text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>

          {/* Days Grid Cells */}
          <div className="grid min-w-[850px] grid-cols-7">
            {cells.map((day, index) => {
              const date = day ? iso(view.year, view.month, day) : "";
              const dayItems = day ? filteredPosts.filter((p) => p.scheduled_date === date) : [];
              return (
                <div key={index} className="min-h-[150px] border-b border-r border-border/70 p-2.5 last:border-r-0 hover:bg-blue-500/5 transition">
                  {day && (
                    <>
                      <div className="mb-2.5 flex items-center justify-between">
                        <strong className="text-xs font-black text-blue-700 dark:text-blue-300 bg-blue-100/90 dark:bg-blue-950 px-2 py-0.5 rounded-md border border-blue-200/90 dark:border-blue-800 shadow-2xs">
                          {day}
                        </strong>
                        <button
                          type="button"
                          className="text-muted-foreground transition hover:text-blue-600 hover:scale-110 p-0.5"
                          aria-label={`Tambah konten ${date}`}
                          onClick={() => setDraft(emptyDraft(date, currentUser?.id))}
                          title="Tambah Konten Manual"
                        >
                          <Plus className="size-4 text-blue-600 dark:text-blue-400" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        {dayItems.map((post) => (
                          <article key={post.id} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-2.5 shadow-sm transition-all hover:border-blue-500 hover:shadow-md">
                            <div className="flex items-center justify-between gap-1">
                              <span className={`status-badge status-${post.status.toLowerCase()} font-bold text-[9px]`}>{post.status}</span>
                              <span className="text-[9px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900">
                                {post.scheduled_time || "18:00"}
                              </span>
                            </div>
                            <h3 className="mt-1.5 text-xs font-extrabold leading-snug line-clamp-2 text-foreground">{post.title}</h3>

                            {post.veo_cost_idr && (
                              <span className="mt-1.5 inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                <DollarSign className="size-2.5" /> Rp{post.veo_cost_idr.toLocaleString("id-ID")}
                              </span>
                            )}

                            <div className="mt-2 flex items-center justify-between border-t border-blue-100 dark:border-blue-900/50 pt-1.5">
                              <Button variant="ghost" size="sm" onClick={() => setDraft(post)} className="h-6 text-[10px] px-2 font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50">
                                <Pencil className="mr-1 size-2.5" /> Detail
                              </Button>
                              <Button variant="ghost" size="icon" className="size-6 text-destructive hover:bg-destructive/10" onClick={() => remove(post.id)}>
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          </article>
                        ))}

                        {/* Auto-Fill AI Button on Empty Days */}
                        {dayItems.length === 0 && (
                          <button
                            type="button"
                            onClick={() => navigate({ to: "/" })}
                            className="w-full mt-2 py-2 rounded-lg border border-dashed border-blue-300/80 hover:border-blue-500 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/80 flex items-center justify-center gap-1 transition"
                          >
                            <Sparkles className="size-3 text-yellow-500" /> Buat Konten AI
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        /* List / Table View Mode */
        <section className="panel rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-white/90 dark:bg-slate-900/90 shadow-md backdrop-blur-md p-4 sm:p-5">
          <h3 className="text-sm font-extrabold mb-4 text-foreground flex items-center gap-2">
            <List className="size-4 text-blue-600" /> Daftar Postingan ({filteredPosts.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>Tanggal & Jam</th>
                  <th>Judul Konten</th>
                  <th>Status</th>
                  <th>Estimasi Biaya AI</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPosts.map((post) => (
                  <tr key={post.id}>
                    <td className="font-semibold text-xs text-foreground">
                      {post.scheduled_date} · {post.scheduled_time || "18:00"}
                    </td>
                    <td className="font-bold text-xs text-foreground max-w-xs truncate">{post.title}</td>
                    <td>
                      <span className={`status-badge status-${post.status.toLowerCase()}`}>{post.status}</span>
                    </td>
                    <td className="text-xs font-bold text-emerald-600">
                      {post.veo_cost_idr ? `Rp${post.veo_cost_idr.toLocaleString("id-ID")}` : "-"}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setDraft(post)} className="h-7 text-xs px-2.5 font-bold">
                          <Pencil className="mr-1 size-3" /> Detail & Ubah
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(post.id)} className="size-7 text-destructive">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>

      {/* Edit Modal Dialog */}
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border-2 border-blue-200 dark:border-blue-800 bg-background p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-extrabold text-foreground flex items-center gap-2">
              <CalendarDays className="size-5 text-blue-600" />
              {draft?.id ? "Detail & Edit Jadwal Konten" : "Buat Konten Baru"}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4 text-xs mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="font-bold text-foreground">Judul Konten</Label>
                <Input id="title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Misal: 3 Strategi Konten FYP Instagram" className="font-semibold" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="date" className="font-bold text-foreground">Tanggal Posting</Label>
                  <Input id="date" type="date" value={draft.scheduled_date} onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="time" className="font-bold text-foreground">Jam Posting</Label>
                  <Input id="time" type="time" value={draft.scheduled_time} onChange={(e) => setDraft({ ...draft, scheduled_time: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="font-bold text-foreground">Status Konten</Label>
                <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value as Status })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["Draft", "Scheduled", "Published"] as Status[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Script Video & One-Click Copy */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="script" className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                    <Clapperboard className="size-4" /> Concept & Script Video (Reel)
                  </Label>
                  {draft.script && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(draft.script, "script")}
                      className="h-6 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100"
                    >
                      {copiedField === "script" ? <Check className="mr-1 size-3 text-emerald-600" /> : <Copy className="mr-1 size-3" />}
                      {copiedField === "script" ? "Script Tersalin!" : "Salin Script"}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="script"
                  rows={4}
                  value={draft.script}
                  onChange={(e) => setDraft({ ...draft, script: e.target.value })}
                  placeholder="Script video scene by scene..."
                  className="font-sans text-xs"
                />
              </div>

              {/* Caption & Hashtags & One-Click Copy */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="caption" className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                    <Layers className="size-4" /> Caption & Hashtags Instagram
                  </Label>
                  {draft.caption && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`${draft.caption}\n\n${(draft.hashtags || []).join(" ")}`, "caption")}
                      className="h-6 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100"
                    >
                      {copiedField === "caption" ? <Check className="mr-1 size-3 text-emerald-600" /> : <Copy className="mr-1 size-3" />}
                      {copiedField === "caption" ? "Caption Tersalin!" : "Salin Caption"}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="caption"
                  rows={3}
                  value={draft.caption}
                  onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
                  placeholder="Tulis caption Instagram di sini..."
                  className="font-sans text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            {draft?.id && (
              <Button
                variant="outline"
                onClick={() => {
                  remove(draft.id);
                  setDraft(null);
                }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 size-3.5" /> Hapus
              </Button>
            )}
            <Button onClick={save} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold">
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
