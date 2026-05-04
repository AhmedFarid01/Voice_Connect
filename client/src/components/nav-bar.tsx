import { Link, useLocation } from "wouter";
import {
  Home, Upload, Radio, LogOut, Search, Sparkles, Library, Settings, User, BarChart3,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { NotificationBell } from "@/components/notification-bell";

export function NavBar({
  onSearch,
  searchValue,
}: {
  onSearch?: (q: string) => void;
  searchValue?: string;
}) {
  const [location] = useLocation();
  const { user, logout } = useUser();
  const [q, setQ] = useState(searchValue ?? "");

  const initials = (user?.displayName || user?.username || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const tab = (href: string, label: string, icon: React.ReactNode) => {
    const active = location === href || (href !== "/" && location.startsWith(href));
    return (
      <Link href={href}>
        <a
          className={cn(
            "group inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all",
            active
              ? "bg-white/10 text-white shadow-inner shadow-white/5"
              : "text-zinc-400 hover:text-white hover:bg-white/5",
          )}
        >
          <span className={cn("transition-transform", active && "scale-110")}>{icon}</span>
          <span className="hidden sm:inline">{label}</span>
        </a>
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/40 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/">
          <a className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-lg shadow-fuchsia-500/30">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="hidden sm:inline gradient-text">Lumen</span>
          </a>
        </Link>

        <nav className="flex items-center gap-1">
          {tab("/", "Home", <Home className="h-4 w-4" />)}
          {tab("/live", "Live", <Radio className="h-4 w-4" />)}
          {tab("/library", "Library", <Library className="h-4 w-4" />)}
          {tab("/upload", "Upload", <Upload className="h-4 w-4" />)}
        </nav>

        <form
          className="hidden md:block flex-1 max-w-md ml-auto relative"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch?.(q);
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search videos, creators…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
            className="pl-9 bg-white/5 border-white/10 focus-visible:ring-violet-500/40 focus-visible:border-violet-400/40 h-10 rounded-xl"
          />
        </form>

        <div className="flex items-center gap-2 md:ml-0 ml-auto">
          <NotificationBell />
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full ring-2 ring-white/10 hover:ring-violet-400/50 transition"
                  title={user.username}
                >
                  <Avatar className="h-9 w-9">
                    {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.username} />}
                    <AvatarFallback
                      className="text-white text-sm font-semibold"
                      style={{
                        background: `linear-gradient(135deg, ${user.avatarColor ?? "#6366f1"}, #1e1b4b)`,
                      }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className="bg-zinc-950/95 backdrop-blur-xl border-white/10 text-white w-[min(calc(100vw-1.5rem),14rem)]"
              >
                <div className="px-2 pt-2 pb-3 border-b border-white/5">
                  <p className="text-sm font-semibold truncate">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
                </div>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/5">
                  <Link href={`/profile/${user.id}`}>
                    <a className="w-full">
                      <User className="h-4 w-4 mr-2" /> Your profile
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/5">
                  <Link href="/library">
                    <a className="w-full">
                      <Library className="h-4 w-4 mr-2" /> Library
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/5">
                  <Link href="/dashboard">
                    <a className="w-full">
                      <BarChart3 className="h-4 w-4 mr-2" /> Dashboard
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-white/5">
                  <Link href="/settings">
                    <a className="w-full">
                      <Settings className="h-4 w-4 mr-2" /> Settings
                    </a>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem
                  onClick={() => logout()}
                  className="cursor-pointer focus:bg-rose-500/10 text-rose-300"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
