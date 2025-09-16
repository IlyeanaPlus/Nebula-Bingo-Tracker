// src/components/Header.jsx
import React from "react";

export default function Header() {
  return (
    <header style={wrap}>
      <div style={left}>
        <Logo />
        <h1 style={title}>Nebula Bingo Tracker</h1>
        <span style={tag}>v2 unified pipeline</span>
      </div>
      <div style={right}>
        {/* room for future actions; keeps layout stable */}
        <a
          href="https://github.com/IlyeanaPlus/Nebula-Bingo-Tracker"
          target="_blank"
          rel="noreferrer"
          className="btn"
          style={btn}
          title="Open repository"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div aria-hidden="true" style={logo}>
      {/* simple inline mark to avoid asset deps */}
      <div style={logoDot} />
      <div style={logoBar} />
    </div>
  );
}

/* ---------- styles ---------- */
const wrap = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderBottom: "1px solid #222",
  background: "var(--header-bg, #121212)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const left = { display: "flex", alignItems: "center", gap: 10, minWidth: 0 };
const right = { display: "flex", alignItems: "center", gap: 8 };

const title = {
  fontSize: 16,
  margin: 0,
  fontWeight: 800,
  letterSpacing: 0.2,
  whiteSpace: "nowrap",
};

const tag = {
  fontSize: 12,
  opacity: 0.7,
  padding: "2px 6px",
  border: "1px solid #2a2a2a",
  borderRadius: 999,
};

const btn = {
  padding: "6px 10px",
  border: "1px solid #2a2a2a",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  textDecoration: "none",
};

const logo = {
  width: 18,
  height: 18,
  position: "relative",
  display: "grid",
  placeItems: "center",
};
const logoDot = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: "var(--accent, #61d095)",
};
const logoBar = {
  position: "absolute",
  width: 16,
  height: 2,
  background: "var(--accent, #61d095)",
  transform: "rotate(30deg)",
  opacity: 0.6,
};
