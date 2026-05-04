import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Loader2, ArrowLeft, MailCheck } from "lucide-react";

export default function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.message || "Request failed");
      setSent(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Couldn't send reset email", description: err?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-md">
        <button
          onClick={() => setLocation("/")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </button>

        <div className="flex items-center gap-2 mb-6">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className="text-xl font-bold gradient-text">Lumen</span>
        </div>

        <div className="glass gradient-border rounded-3xl p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 grid place-items-center rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 mb-4">
                <MailCheck className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold">Check your email</h2>
              <p className="mt-2 text-sm text-zinc-400">
                If <strong className="text-white">{email}</strong> matches an account, we just sent
                a reset link there. The link expires in one hour.
              </p>
              <Button
                onClick={() => setLocation("/")}
                className="mt-6 rounded-xl bg-white text-black hover:bg-white/90 font-semibold w-full"
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold">Forgot your password?</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Enter your email and we'll send you a link to choose a new one.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    Email
                  </span>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="mt-1.5 bg-white/5 border-white/10 h-11 rounded-xl"
                    placeholder="you@example.com"
                  />
                </label>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-fuchsia-500/30"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send reset link
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
