import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto h-16 w-16 rounded-2xl grid place-items-center bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 shadow-lg shadow-fuchsia-500/30">
          <Compass className="h-7 w-7 text-white" />
        </div>
        <h1 className="mt-6 text-4xl font-bold gradient-text">Lost in the feed</h1>
        <p className="mt-2 text-zinc-400">
          The page you're looking for slipped past us. Let's get you back.
        </p>
        <Link href="/">
          <a className="inline-block mt-6">
            <Button className="rounded-xl bg-white text-black hover:bg-white/90 px-5 h-11 font-semibold">
              Back to home
            </Button>
          </a>
        </Link>
      </div>
    </div>
  );
}
