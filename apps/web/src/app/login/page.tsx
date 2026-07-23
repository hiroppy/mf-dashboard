import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;

  return (
    <main className="min-h-dvh bg-background px-4 flex items-center justify-center">
      <section className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">ダッシュボードへログイン</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          閲覧用パスワードを入力してください。セッションは一定時間後に失効します。
        </p>
        {error === "invalid" && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            パスワードが正しくありません。
          </p>
        )}
        <form action="/api/auth/login/" method="post" className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ログイン
          </button>
        </form>
      </section>
    </main>
  );
}
