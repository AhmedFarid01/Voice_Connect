import { useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { NavBar } from "@/components/nav-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lock, LogOut, Trash2, KeyRound, Loader2, ShieldAlert } from "lucide-react";

export default function SettingsPage() {
  const { user, logout } = useUser();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (!user) return null;

  const isOAuth = user.provider && user.provider !== "local";

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next.length < 6) {
      toast({ variant: "destructive", title: "Password must be at least 6 characters" });
      return;
    }
    if (pw.next !== pw.confirm) {
      toast({ variant: "destructive", title: "New passwords don't match" });
      return;
    }
    setPwSaving(true);
    const r = await fetch("/api/me/password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
    });
    setPwSaving(false);
    if (!r.ok) {
      const msg = await r.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Couldn't change password", description: msg?.message });
      return;
    }
    setPw({ current: "", next: "", confirm: "" });
    toast({ title: "Password updated", description: "Use the new password next time you sign in." });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    const r = await fetch("/api/me", { method: "DELETE", credentials: "include" });
    setDeleting(false);
    if (!r.ok) {
      toast({ variant: "destructive", title: "Couldn't delete account" });
      return;
    }
    toast({ title: "Account deleted", description: "Sorry to see you go." });
    setLocation("/");
    window.location.reload();
  };

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Settings</h1>
          <p className="text-sm sm:text-base text-zinc-400 mt-1">
            Manage your account, sign-in, and privacy.
          </p>
        </div>

        {/* Account info */}
        <Section title="Account" icon={<KeyRound className="h-4 w-4" />}>
          <Row label="Username" value={user.username} hint="Your handle. Cannot be changed." />
          <Row label="Email" value={user.email} />
          <Row
            label="Sign-in method"
            value={user.provider === "local" ? "Email + password" : `Connected to ${user.provider}`}
          />
          <div className="pt-3 flex">
            <Button
              variant="outline"
              onClick={() => setLocation(`/profile/${user.id}`)}
              className="rounded-xl border-white/15 hover:bg-white/10"
            >
              Edit profile (display name, bio, avatar) →
            </Button>
          </div>
        </Section>

        {/* Password */}
        <Section title="Password" icon={<Lock className="h-4 w-4" />}>
          {isOAuth ? (
            <p className="text-sm text-zinc-400">
              You signed in with <strong className="text-white">{user.provider}</strong>. Manage your
              password through {user.provider}'s account settings.
            </p>
          ) : (
            <form onSubmit={changePassword} className="space-y-4 max-w-md">
              <Field label="Current password">
                <Input
                  type="password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  className="bg-white/5 border-white/10 h-11 rounded-xl"
                  required
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  className="bg-white/5 border-white/10 h-11 rounded-xl"
                  minLength={6}
                  required
                />
              </Field>
              <Field label="Confirm new password">
                <Input
                  type="password"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  className="bg-white/5 border-white/10 h-11 rounded-xl"
                  minLength={6}
                  required
                />
              </Field>
              <Button
                type="submit"
                disabled={pwSaving}
                className="rounded-xl bg-white text-black hover:bg-white/90 font-semibold"
              >
                {pwSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Change password
              </Button>
            </form>
          )}
        </Section>

        {/* Sessions */}
        <Section title="Session" icon={<LogOut className="h-4 w-4" />}>
          <p className="text-sm text-zinc-400 mb-4">Sign out of this device. You'll need to sign back in.</p>
          <Button
            variant="outline"
            onClick={() => logout()}
            className="rounded-xl border-white/15 hover:bg-white/10"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </Section>

        {/* Danger zone */}
        <Section
          title="Danger zone"
          icon={<ShieldAlert className="h-4 w-4" />}
          variant="danger"
        >
          <p className="text-sm text-zinc-300">
            Deleting your account permanently removes your videos, broadcasts, comments, follows, and
            saved items. This cannot be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="mt-4 rounded-xl bg-rose-500 hover:bg-rose-400 text-white border-0 font-semibold">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-zinc-950 border-white/10 text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  Everything tied to <strong className="text-white">@{user.username}</strong> goes
                  away — videos, comments, follows, saves, watch history. This cannot be undone.
                  Type <strong className="text-white">{user.username}</strong> below to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={user.username}
                className="bg-white/5 border-white/10 rounded-xl"
              />
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => setDeleteConfirm("")}
                  className="bg-white/5 border-white/15 hover:bg-white/10 text-white"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirm !== user.username || deleting}
                  onClick={deleteAccount}
                  className="bg-rose-500 hover:bg-rose-400 text-white border-0"
                >
                  {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Delete forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  icon,
  variant,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  variant?: "danger";
  children: React.ReactNode;
}) {
  const danger = variant === "danger";
  return (
    <section
      className={`rounded-3xl border p-6 ${
        danger ? "border-rose-400/30 bg-rose-500/5" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`grid place-items-center h-7 w-7 rounded-lg ${
            danger
              ? "bg-rose-500/20 border border-rose-400/30 text-rose-200"
              : "bg-violet-500/15 border border-violet-400/20 text-violet-200"
          }`}
        >
          {icon}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-medium text-white">
        {value}
        {hint && <span className="ml-2 text-xs text-zinc-500">{hint}</span>}
      </span>
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
