import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (pw.next.length < 6) {
      toast({ variant: "destructive", title: "Password must be at least 6 characters" });
      return;
    }
    if (pw.next !== pw.confirm) {
      toast({ variant: "destructive", title: "Passwords don't match" });
      return;
    }
    setSubmitting(true);
    const r = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw.next }),
    });
    setSubmitting(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Couldn't reset password", description: data?.message });
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="text-xl font-bold gradient-text">Lumen</span>
        </div>

        <div className="glass gradient-border rounded-3xl p-8">
          {!token ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 grid place-items-center rounded-2xl bg-rose-500/15 border border-rose-400/30 text-rose-300 mb-4">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold">Reset link invalid</h2>
              <p className="mt-2 text-sm text-zinc-400">
                This page needs a valid reset token. Try requesting a new link.
              </p>
              <Button
                onClick={() => setLocation("/forgot-password")}
                className="mt-6 rounded-xl bg-white text-black hover:bg-white/90 font-semibold w-full"
              >
                Request a new link
              </Button>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 grid place-items-center rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 mb-4">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold">Password updated</h2>
              <p className="mt-2 text-sm text-zinc-400">
                You can now sign in with your new password.
              </p>
              <Button
                onClick={() => setLocation("/")}
                className="mt-6 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 font-semibold w-full"
              >
                Sign in
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold">Choose a new password</h2>
              <p className="text-sm text-zinc-400 mt-1">
                It must be at least 6 characters long.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    New password
                  </span>
                  <Input
                    type="password"
                    value={pw.next}
                    onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                    required
                    minLength={6}
                    autoFocus
                    className="mt-1.5 bg-white/5 border-white/10 h-11 rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Confirm new password
                  </span>
                  <Input
                    type="password"
                    value={pw.confirm}
                    onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                    required
                    minLength={6}
                    className="mt-1.5 bg-white/5 border-white/10 h-11 rounded-xl"
                  />
                </label>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-fuchsia-500/30"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Update password
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
