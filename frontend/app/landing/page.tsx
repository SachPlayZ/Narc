import type { CSSProperties } from "react";
import styles from "./landing.module.css";

const asset = (name: string) => `/narc-landing/${name}`;

const ecosystem = [
  { name: "Sui", icon: "ecosystem-sui.svg", accent: "blue" },
  { name: "DeepBook", icon: "ecosystem-deepbook.svg" },
  { name: "Walrus", icon: "ecosystem-walrus.svg" },
  { name: "Move", icon: "ecosystem-move.svg" },
];

const featureCards = [
  {
    title: "Walrus evidence",
    icon: "feature-walrus-evidence.svg",
    body: "Every reasoning step is encrypted and stored on Walrus as tamper-evident blobs. Verifiable by anyone, forever.",
  },
  {
    title: "Independent risk audit",
    icon: "feature-risk-audit.svg",
    body: "NARC continuously recomputes risk from on-chain evidence and agent activity.",
  },
  {
    title: "On-chain freeze",
    icon: "feature-onchain-freeze.svg",
    body: "If policy is violated, NARC autonomously calls a Move contract on Sui to freeze the agent. No humans in the loop.",
  },
];

const rows = [
  {
    number: "01",
    title: "Encrypted decision blobs",
    icon: "row-encrypted-blob-icon.svg",
    visual: "mini-blob-squares.svg",
    body: "Agent reasoning is encrypted client-side before being written to Walrus. Only verifiable hashes are used on-chain.",
  },
  {
    number: "02",
    title: "Tamper-evident audit trail",
    icon: "row-audit-trail-icon.svg",
    visual: "mini-audit-nodes.svg",
    body: "Every action produces an immutable trail that anyone can verify end-to-end.",
  },
  {
    number: "03",
    title: "Autonomous Narc verdicts",
    icon: "row-narc-verdict-icon.svg",
    visual: "mini-verdict-bars.svg",
    body: "NARC runs independently, using the same evidence and policies to decide risk and enforcement.",
  },
  {
    number: "04",
    title: "Owner override control",
    icon: "row-owner-override-icon.svg",
    visual: "mini-override-slider.svg",
    body: "Owners can review the on-chain evidence and override a freeze to resume trading.",
  },
];

const workflow = [
  ["01", "Trade", "The agent places an order on DeepBook (Sui)."],
  ["02", "Explain", "The agent explains its intent and reasoning."],
  ["03", "Store", "The explanation is encrypted and stored on Walrus."],
  ["04", "Audit", "NARC audits the decision and computes risk."],
  ["05", "Freeze", "If policy is breached, NARC freezes the agent via Move on Sui."],
];

const proofCards = [
  {
    title: "No private database",
    icon: "proof-no-database.svg",
    body: "All evidence lives on Walrus, a decentralized storage network. Nothing is hidden.",
  },
  {
    title: "Replayable decisions",
    icon: "proof-replayable-decisions.svg",
    body: "Anyone can replay the same evidence to reach the same verdict.",
  },
  {
    title: "Policy-backed enforcement",
    icon: "proof-policy-enforcement.svg",
    body: "Enforcement is deterministic and governed by transparent on-chain policy.",
  },
];

const footerColumns = [
  ["Product", "Overview", "Features", "Use cases", "Pricing"],
  ["Developers", "Documentation", "SDK", "Smart contracts", "Integrations"],
  ["Protocol", "Architecture", "Security", "Audits", "Policy"],
  ["Company", "About", "Blog", "Careers", "Contact"],
];

const reveal = (delay: number): CSSProperties =>
  ({ ["--enter-delay" as string]: `${delay}ms` }) as CSSProperties;

function RedDot() {
  return <span className={styles.redDot} aria-hidden="true" />;
}

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <header className={`${styles.header} ${styles.reveal}`} style={reveal(40)}>
        <a className={styles.logoLink} href="/landing" aria-label="NARC landing page">
          <img src={asset("narc-wordmark.svg")} alt="NARC" className={`${styles.logo} ${styles.brandSvg}`} style={reveal(90)} />
        </a>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#protocol">Protocol</a>
          <a href="#security">Security</a>
          <a href="#docs">Docs</a>
        </nav>
        <div className={styles.headerActions}>
          <a href="/onboard" className={styles.signIn}>Sign in</a>
          <a href="/onboard" className={styles.headerCta}>Get started <RedDot /></a>
        </div>
      </header>

      <section className={`${styles.hero} ${styles.reveal}`} style={reveal(120)}>
        <div className={styles.crossLeft} aria-hidden="true" />
        <div className={styles.crossRight} aria-hidden="true" />
        <p className={styles.eyebrow}>Autonomous enforcement for AI agents</p>
        <h1 className={styles.heroTitle}>
          <span className={styles.heroTitleLine}>
            <span className={styles.heroTitleSegment} style={reveal(180)}>Every AI trading decision,</span>
          </span>
          <span className={styles.heroTitleLine}>
            <span className={styles.heroTitleSegment} style={reveal(300)}>audited on-chain.</span>
          </span>
        </h1>
        <p className={styles.heroCopy}>
          NARC verifies agent intent, risk, and evidence from Walrus, then enforces policy on Sui without human intervention.
        </p>
        <div className={styles.heroActions}>
          <a href="/onboard" className={styles.primaryButton}>Start monitoring <RedDot /></a>
          <a href="#protocol" className={styles.secondaryButton}>Read the protocol <span aria-hidden="true">-&gt;</span></a>
        </div>
        <div className={styles.downArrow} aria-hidden="true">v</div>
      </section>

      <section className={`${styles.ecosystem} ${styles.reveal}`} style={reveal(180)} aria-label="Built for the Sui ecosystem">
        <div className={styles.ecosystemLabel}>Built for the Sui ecosystem</div>
        <div className={styles.ecosystemItems}>
          {ecosystem.map((item, index) => (
            <div className={`${styles.ecosystemItem} ${styles.reveal}`} style={reveal(220 + index * 50)} key={item.name}>
              <img src={asset(item.icon)} alt="" className={styles.ecosystemLogo} style={reveal(260 + index * 50)} />
              <span>{item.name}</span>
              {item.accent && <span className={styles.blueDot} aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.featureCards} ${styles.reveal}`} style={reveal(240)} id="product">
        {featureCards.map((feature, index) => (
          <article className={`${styles.featureCard} ${styles.reveal}`} style={reveal(280 + index * 70)} key={feature.title}>
            <img src={asset(feature.icon)} alt="" className={styles.featureArtwork} style={reveal(340 + index * 70)} />
            <h2>{feature.title} <RedDot /></h2>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className={`${styles.rowTable} ${styles.reveal}`} style={reveal(300)} aria-label="Feature details">
        {rows.map((row, index) => (
          <article className={`${styles.featureRow} ${styles.reveal}`} style={reveal(340 + index * 70)} key={row.number}>
            <div className={styles.rowNumber}>{row.number}</div>
            <div className={styles.rowIcon}>
              <img src={asset(row.icon)} alt="" className={styles.rowGlyph} style={reveal(400 + index * 70)} />
            </div>
            <div className={styles.rowText}>
              <h3>{row.title} <RedDot /></h3>
              <p>{row.body}</p>
            </div>
            <div className={styles.rowVisual}>
              <img src={asset(row.visual)} alt="" className={styles.rowDiagram} style={reveal(430 + index * 70)} />
            </div>
          </article>
        ))}
      </section>

      <section className={`${styles.workflow} ${styles.reveal}`} style={reveal(360)} id="protocol">
        <p className={styles.sectionKicker}>How NARC works <RedDot /></p>
        <div className={styles.workflowGrid}>
          {workflow.map(([step, title, body], index) => (
            <article className={`${styles.workflowStep} ${styles.reveal}`} style={reveal(400 + index * 70)} key={step}>
              <div className={`${styles.stepCircle} ${index === workflow.length - 1 ? styles.stepDanger : ""}`}>{step}</div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.proof} ${styles.reveal}`} style={reveal(440)} id="security">
        <p className={styles.sectionKicker}>Evidence you can verify <RedDot /></p>
        <div className={styles.proofGrid}>
          {proofCards.map((card, index) => (
            <article className={`${styles.proofCard} ${styles.reveal}`} style={reveal(480 + index * 70)} key={card.title}>
              <img src={asset(card.icon)} alt="" className={styles.proofArtwork} style={reveal(540 + index * 70)} />
              <h3>{card.title} <RedDot /></h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.finalCta} ${styles.reveal}`} style={reveal(520)}>
        <img src={asset("decor-dot-grid.svg")} alt="" className={styles.ctaDotsLeft} />
        <img src={asset("decor-dot-grid.svg")} alt="" className={styles.ctaDotsRight} />
        <h2>Build agents that can be stopped <RedDot /></h2>
        <div className={styles.heroActions}>
          <a href="/onboard" className={styles.primaryButton}>Launch NARC <RedDot /></a>
          <a href="#docs" className={styles.secondaryButton}>View docs <span aria-hidden="true">-&gt;</span></a>
        </div>
      </section>

      <footer className={`${styles.footer} ${styles.reveal}`} style={reveal(560)} id="docs">
        <div className={styles.footerBrand}>
          <img src={asset("narc-wordmark.svg")} alt="NARC" className={styles.footerLogo} style={reveal(620)} />
          <p>Autonomous risk enforcement for AI trading agents on Sui.</p>
          <div className={styles.socials} aria-hidden="true">
            <span>X</span>
            <span>DC</span>
            <span>GH</span>
            <span>DOC</span>
          </div>
          <small>(c) 2024 NARC Labs, Inc. All rights reserved.</small>
        </div>
        <div className={styles.footerLinks}>
          {footerColumns.map(([title, ...links]) => (
            <div key={title}>
              <h3>{title}</h3>
              {links.map((link) => (
                <a href="/landing" key={link}>{link}</a>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.legal}>
          <a href="/landing">Privacy</a>
          <a href="/landing">Terms</a>
          <a href="/landing">Legal</a>
        </div>
      </footer>
    </main>
  );
}
