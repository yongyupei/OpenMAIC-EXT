import Link from 'next/link';

export default function ExtendsIndexPage() {
  return (
    <main className="mx-auto max-w-2xl p-8 font-sans">
      <h1 className="mb-2 text-2xl font-semibold">OpenMAIC Extensions</h1>
      <p className="text-muted-foreground text-sm">
        Secondary development routes live under the <code>/extends</code> prefix. The upstream home
        remains at <Link href="/">/</Link>.
      </p>
      <ul className="mt-4 list-disc pl-6 text-sm">
        <li>
          <Link href="/home" className="underline">
            Extension workbench home
          </Link>{' '}
          — fork home with slide templates and knowledge-base shortcuts
        </li>
        <li>
          <Link href="/extends/knowledge-base" className="underline">
            Knowledge base
          </Link>
        </li>
        <li>
          <Link href="/extends/slide-templates" className="underline">
            Slide templates
          </Link>
        </li>
      </ul>
    </main>
  );
}
