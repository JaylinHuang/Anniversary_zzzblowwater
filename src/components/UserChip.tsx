import Link from "next/link";

type Props = {
  displayName: string;
  avatarUrl?: string | null;
  /** 链接到个人页时传入用户 id */
  userId?: number;
  size?: "sm" | "md";
  className?: string;
};

/** 头像 + 昵称；无头像时用昵称首字 */
export function UserChip({
  displayName,
  avatarUrl,
  userId,
  size = "sm",
  className = "",
}: Props) {
  const dim = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs";
  const text = size === "md" ? "text-sm" : "text-xs";
  const initial = (displayName || "?").slice(0, 1);

  const avatar = (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(61,224,208,0.4)] bg-[rgba(61,224,208,0.1)] ${dim}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="brand-font text-[var(--cyan)]">{initial}</span>
      )}
    </span>
  );

  const body = (
    <span className={`inline-flex items-center gap-2 ${text} ${className}`}>
      {avatar}
      <span className="truncate text-[var(--fog)]">{displayName}</span>
    </span>
  );

  if (userId != null) {
    return (
      <Link href={`/members/${userId}`} className="hover:opacity-90">
        {body}
      </Link>
    );
  }
  return body;
}
