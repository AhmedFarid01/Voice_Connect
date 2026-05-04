import { Link } from "wouter";

const HASHTAG = /(#[A-Za-z0-9_]{2,30})/g;
const HASHTAG_TEST = /^#[A-Za-z0-9_]{2,30}$/;

export function RichText({ children }: { children: string }) {
  if (!children) return null;
  const parts = children.split(HASHTAG);
  return (
    <>
      {parts.map((p, i) =>
        HASHTAG_TEST.test(p) ? (
          <Link key={i} href={`/?search=${encodeURIComponent(p)}`}>
            <a
              className="text-violet-300 hover:text-violet-200 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {p}
            </a>
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
