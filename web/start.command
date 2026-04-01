#!/bin/bash
# CAMS Study Guide - Double-click this file to start
cd "$(dirname "$0")"
echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     CAMS Study Guide Platform         ║"
echo "  ║                                       ║"
echo "  ║  Opening in your browser...           ║"
echo "  ║  (Keep this window open while studying)║"
echo "  ║                                       ║"
echo "  ║  Press Ctrl+C to stop                 ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# Open browser after a short delay
(sleep 1 && open "http://localhost:8000/web/") &

# Start server from repo root so study-guide/ is accessible
cd ..
python3 -m http.server 8000
