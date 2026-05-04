import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, Loader2, Film, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORIES = ["General", "Music", "Gaming", "Education", "Comedy", "Tech", "Lifestyle"];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

interface ThumbResult {
  blob: Blob;
  durationSec: number;
}

async function captureThumbnail(file: File): Promise<ThumbResult | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = Math.min(640, v.videoWidth || 640);
      c.height = Math.min(360, v.videoHeight || 360);
      const ctx = c.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return resolve(null);
      }
      ctx.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) return resolve(null);
          resolve({ blob, durationSec: Math.floor(v.duration || 0) });
        },
        "image/jpeg",
        0.7,
      );
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; status: number; body: any }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = xhr.responseText;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* keep as text */
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: "Network error" });
    xhr.send(form);
  });
}

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const onPick = (f: File) => {
    if (!f.type.startsWith("video/")) {
      toast({ variant: "destructive", title: "Pick a video file" });
      return;
    }
    if (f.size > MAX_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB for the demo.`,
      });
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const reset = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast({ variant: "destructive", title: "Select a video first" });
      return;
    }
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Add a title" });
      return;
    }
    setSubmitting(true);
    setProgress(0);
    try {
      const thumb = await captureThumbnail(file);

      const form = new FormData();
      form.append("video", file);
      if (thumb?.blob) form.append("thumbnail", thumb.blob, "thumb.jpg");
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("category", category);
      form.append("durationSec", String(thumb?.durationSec ?? 0));

      const result = await uploadWithProgress("/api/videos", form, setProgress);
      if (!result.ok) {
        const msg = typeof result.body === "string" ? result.body : result.body?.message;
        throw new Error(msg || `Upload failed (${result.status})`);
      }
      const created = result.body;
      toast({ title: "Uploaded!", description: "Your video is live." });
      qc.invalidateQueries({ queryKey: ["videos"] });
      setLocation(`/watch/${created.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err?.message ?? "Try again." });
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Upload a video</h1>
          <p className="text-zinc-400 mt-1">Pick a clip, fill in the details, and publish.</p>
        </div>

        <form onSubmit={submit} className="grid lg:grid-cols-2 gap-8">
          {/* Left: drop zone / preview */}
          <div>
            {!file ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onPick(f);
                }}
                className={cn(
                  "w-full aspect-video rounded-3xl border-2 border-dashed transition-all",
                  "grid place-items-center text-center px-6",
                  dragOver
                    ? "border-violet-400 bg-violet-500/10"
                    : "border-white/15 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/25",
                )}
              >
                <div>
                  <span className="grid place-items-center mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-fuchsia-500/30">
                    <CloudUpload className="h-7 w-7 text-white" />
                  </span>
                  <p className="mt-4 font-semibold">Drop a video here</p>
                  <p className="text-sm text-zinc-400">
                    or <span className="text-violet-300">click to browse</span>
                  </p>
                  <p className="mt-3 text-xs text-zinc-500">MP4, WebM, MOV — up to 50 MB</p>
                </div>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-black aspect-video">
                  <video src={previewUrl!} controls className="h-full w-full" />
                </div>
                <div className="flex items-center justify-between rounded-2xl glass px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Film className="h-4 w-4 text-violet-300 shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={reset}
                    className="text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
              }}
            />
          </div>

          {/* Right: details */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your video a great title"
                maxLength={140}
                className="mt-1.5 bg-white/5 border-white/10 h-11 rounded-xl"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell viewers what this is about…"
                rows={5}
                maxLength={2000}
                className="mt-1.5 bg-white/5 border-white/10 rounded-xl resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Category</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                      c === category
                        ? "bg-white text-black"
                        : "bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/")}
                className="rounded-xl border-white/15 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !file}
                className="relative flex-1 rounded-xl h-11 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-fuchsia-500/30 overflow-hidden"
              >
                {submitting && (
                  <span
                    className="absolute inset-y-0 left-0 bg-white/25 transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                )}
                <span className="relative inline-flex items-center">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Uploading {progress}%
                    </>
                  ) : (
                    <>Publish video</>
                  )}
                </span>
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
