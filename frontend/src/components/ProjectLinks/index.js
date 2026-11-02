import './index.css';

export default function ProjectLinks() {
  return (
    <nav className="project-links" aria-label="Project links">
      <a href="https://imrocky.com/"><span aria-hidden="true">← </span>Portfolio</a>
      <a
        href="https://github.com/CHEN-Ziyang-Rocky/ai-finadvisor"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="AI Financial Advisor source on GitHub (opens in a new tab)"
      >GitHub <span aria-hidden="true">↗</span></a>
    </nav>
  );
}
