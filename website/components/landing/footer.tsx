import Link from "next/link";

const footerLinks = {
  Product: [
    { label: "Documentation", href: "/docs" },
    { label: "Installation", href: "/docs" },
    { label: "Changelog", href: "https://github.com/prosperitypirate/codexfi/blob/main/plugin/CHANGELOG.md", external: true },
  ],
  Resources: [
    { label: "GitHub", href: "https://github.com/prosperitypirate/codexfi", external: true },
    { label: "npm", href: "https://www.npmjs.com/package/codexfi", external: true },
    { label: "License (MIT)", href: "https://github.com/prosperitypirate/codexfi/blob/main/LICENSE", external: true },
  ],
  Community: [
    { label: "Issues", href: "https://github.com/prosperitypirate/codexfi/issues", external: true },
    { label: "Discussions", href: "https://github.com/prosperitypirate/codexfi/discussions", external: true },
  ],
} as const;

export function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <p className="mb-2 text-sm font-semibold text-[#f5f5f5]">
              codexfi
            </p>
            <p className="text-sm text-[#a0a0a0]">
              Persistent memory for AI coding agents.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <p className="mb-3 text-sm font-semibold text-[#f5f5f5]">
                {section}
              </p>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#a0a0a0] transition-colors hover:text-[#f5f5f5]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-[#a0a0a0] transition-colors hover:text-[#f5f5f5]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-[#2a2a2a] pt-6 text-center text-xs text-[#a0a0a0]">
          &copy; {new Date().getFullYear()} codexfi &middot; MIT License
        </div>
      </div>
    </footer>
  );
}
