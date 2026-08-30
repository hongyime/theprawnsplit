<script lang="ts">
  export let name: string;
  export let size: number | string = 24;

  const icons: Record<string, string[]> = {
    archive: ["M4 7h16", "M6 7v13h12V7", "M9 11h6", "M8 3h8l2 4H6z"],
    download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
    "git-merge": ["M6 3v6a6 6 0 0 0 6 6h4", "M18 13l3 3-3 3", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6"],
    "key-round": ["M2 18a6 6 0 1 1 10.4-4.1L22 4v5h-4v4h-4l-2.3 2.3A6 6 0 0 1 2 18z", "M7 18h.01"],
    link: ["M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1", "M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"],
    plus: ["M12 5v14", "M5 12h14"],
    "qr-code": ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2", "M18 14h2v2", "M14 18h6"],
    "receipt-text": ["M4 3h16v18l-3-2-2 2-3-2-3 2-2-2-3 2z", "M8 8h8", "M8 12h8", "M8 16h5"],
    "refresh-ccw": ["M21 12a9 9 0 0 0-15.7-6.1L3 8", "M3 3v5h5", "M3 12a9 9 0 0 0 15.7 6.1L21 16", "M16 16h5v5"],
    settings: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8", "M4 12h2", "M18 12h2", "M12 4v2", "M12 18v2", "M6.3 6.3l1.4 1.4", "M16.3 16.3l1.4 1.4", "M17.7 6.3l-1.4 1.4", "M7.7 16.3l-1.4 1.4"],
    share: ["M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M8.6 13.5l6.8 4", "M15.4 6.5l-6.8 4"],
    shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-5"],
    trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 15h10l1-15", "M10 11v6", "M14 11v6"],
    upload: ["M12 21V9", "M7 14l5-5 5 5", "M5 3h14"],
    users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
    wallet: ["M3 7h18v14H3z", "M3 7l3-4h12l3 4", "M16 14h3"],
  };

  $: paths = icons[name] ?? icons.settings;
</script>

<svg
  aria-hidden="true"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#each paths as path}
    <path d={path} />
  {/each}
</svg>
