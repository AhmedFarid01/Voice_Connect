import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useUser } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Radio, Upload, Heart } from "lucide-react";
import { FaGoogle, FaGithub } from "react-icons/fa";

const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email"),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

interface ProviderStatus {
  google: boolean;
  github: boolean;
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register: registerUser } = useUser();
  const { toast } = useToast();
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    displayName: "",
  });

  const { data: providers } = useQuery<ProviderStatus>({
    queryKey: ["/api/auth/providers"],
  });

  // Show a toast if we got bounced back here with ?authError=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("authError");
    if (err) {
      toast({
        variant: "destructive",
        title: "Sign-in failed",
        description: `${err.charAt(0).toUpperCase() + err.slice(1)} authentication didn't complete.`,
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const anyProvider = !!(providers?.google || providers?.github);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (isLogin) {
        const parsed = loginSchema.safeParse(form);
        if (!parsed.success) {
          toast({ variant: "destructive", title: "Invalid input", description: "Check your credentials" });
          return;
        }
        const r = await login({ username: form.username, password: form.password });
        if (!r.ok) {
          toast({ variant: "destructive", title: "Login failed", description: r.message });
          return;
        }
        toast({ title: "Welcome back!", description: "You're signed in." });
      } else {
        const parsed = registerSchema.safeParse(form);
        if (!parsed.success) {
          toast({
            variant: "destructive",
            title: "Invalid input",
            description: parsed.error.issues[0]?.message ?? "Check the form",
          });
          return;
        }
        const r = await registerUser(form);
        if (!r.ok) {
          toast({ variant: "destructive", title: "Sign-up failed", description: r.message });
          return;
        }
        toast({ title: "Welcome to Lumen!", description: "Your account is ready." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message ?? "Unexpected error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left – brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(800px 500px at 20% 30%, rgba(167,139,250,0.35), transparent 60%), radial-gradient(700px 500px at 80% 70%, rgba(244,114,182,0.25), transparent 60%), linear-gradient(135deg, #0d0a1a, #100416)",
          }}
        />

        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-2xl shadow-fuchsia-500/40">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <span className="text-2xl font-bold gradient-text">Lumen</span>
        </div>

        <div className="space-y-6 max-w-md">
          <h1 className="text-5xl font-bold leading-tight">
            Share what you <span className="gradient-text">love.</span>
            <br />
            Go <span className="gradient-text">live.</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Upload videos, broadcast live in seconds, and connect with creators across the globe.
          </p>
          <div className="space-y-3 pt-4">
            <Feature icon={<Upload className="h-4 w-4" />} title="Upload videos" desc="Share clips up to several minutes long." />
            <Feature icon={<Radio className="h-4 w-4" />} title="Go live instantly" desc="Stream from your camera with one click." />
            <Feature icon={<Heart className="h-4 w-4" />} title="Build a following" desc="Likes, comments, and a real-time feed." />
          </div>
        </div>

        <p className="text-xs text-zinc-500">© Lumen — share something today.</p>
      </div>

      {/* Right – form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="text-xl font-bold gradient-text">Lumen</span>
          </div>

          <div className="glass gradient-border rounded-3xl p-8">
            <h2 className="text-2xl font-bold">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {isLogin ? "Sign in to keep watching." : "Join in less than a minute."}
            </p>

            {anyProvider && (
              <>
                <div className="mt-6 grid gap-2.5">
                  {providers?.google && (
                    <a
                      href="/api/auth/google"
                      className="inline-flex items-center justify-center gap-3 h-11 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition shadow"
                    >
                      <FaGoogle className="h-4 w-4 text-[#ea4335]" />
                      Continue with Google
                    </a>
                  )}
                  {providers?.github && (
                    <a
                      href="/api/auth/github"
                      className="inline-flex items-center justify-center gap-3 h-11 rounded-xl bg-zinc-900 text-white font-semibold border border-white/10 hover:bg-zinc-800 transition"
                    >
                      <FaGithub className="h-4 w-4" />
                      Continue with GitHub
                    </a>
                  )}
                </div>
                <div className="mt-6 flex items-center gap-3 text-xs text-zinc-500">
                  <span className="h-px flex-1 bg-white/10" />
                  or use email
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            )}

            <form onSubmit={onSubmit} className={anyProvider ? "mt-6 space-y-4" : "mt-6 space-y-4"}>
              <Field label="Username">
                <Input
                  name="username"
                  value={form.username}
                  onChange={onChange}
                  placeholder="janedoe"
                  className="bg-white/5 border-white/10 h-11 rounded-xl"
                  disabled={isSubmitting}
                />
              </Field>

              <Field label="Password">
                <Input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={onChange}
                  placeholder="••••••••"
                  className="bg-white/5 border-white/10 h-11 rounded-xl"
                  disabled={isSubmitting}
                />
              </Field>

              {!isLogin && (
                <>
                  <Field label="Display name">
                    <Input
                      name="displayName"
                      value={form.displayName}
                      onChange={onChange}
                      placeholder="Jane Doe"
                      className="bg-white/5 border-white/10 h-11 rounded-xl"
                      disabled={isSubmitting}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={onChange}
                      placeholder="you@example.com"
                      className="bg-white/5 border-white/10 h-11 rounded-xl"
                      disabled={isSubmitting}
                    />
                  </Field>
                </>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 hover:opacity-90 border-0 font-semibold shadow-lg shadow-fuchsia-500/30"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isLogin ? "Sign in" : "Create account"}
              </Button>

              <button
                type="button"
                onClick={() => setIsLogin((v) => !v)}
                className="w-full text-sm text-zinc-400 hover:text-white transition"
                disabled={isSubmitting}
              >
                {isLogin ? "New here? Create an account →" : "Already have an account? Sign in →"}
              </button>
              {isLogin && (
                <a
                  href="/forgot-password"
                  className="block text-center text-xs text-zinc-500 hover:text-violet-300 transition"
                >
                  Forgot your password?
                </a>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid place-items-center h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-violet-300">
        {icon}
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-zinc-400">{desc}</p>
      </div>
    </div>
  );
}
