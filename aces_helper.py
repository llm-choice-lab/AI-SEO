"""
LLM Conjoint Lab: ACES storefront helper.

Run:  python aces_helper.py
Then the Lab opens at http://127.0.0.1:8765 in your browser.

What it does
- Serves the Lab (index.html in this folder) and the mock ACES store pages.
- For each storefront trial, Selenium opens the store's search page in headless Chrome,
  types the query into the search box and presses Enter, waits for the results page,
  and takes a 1280 x 1080 screenshot. After the model chooses, Selenium opens the page
  again the same way and clicks that product's Add to Cart button, then checks the cart.
  This is the procedure of the v6 notebook ("ACES procedure + reading fixes"), which follows
  ACES (Allouah, Besbes, Figueroa, Kanoria & Kumar, 2025, arXiv:2508.02630;
  github.com/mycustomai/ACES, MIT licence).
- API keys never reach this helper: the Lab calls the model APIs itself.

Needs: Python 3.9+, Google Chrome, and `pip install selenium` (Selenium Manager fetches the
matching ChromeDriver automatically). Optional environment variables: CHROME_BINARY, CHROMEDRIVER.
Options: --port 8765  --drivers 4 (how many headless Chrome windows work in parallel)  --no-open
"""
import argparse, base64, html, json, os, queue, re, sys, threading, time, webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

VERSION = "1.0"
HERE = Path(__file__).resolve().parent
SITE = HERE / "aces_store"            # generated store pages (safe to delete)
SITE.mkdir(exist_ok=True)

# ---------------------------------------------------------------- settings (as in v6)
WINDOW_WIDTH, WINDOW_HEIGHT = 1280, 1080             # ACES browser size
CARD_TEXT_PX = dict(spec=17, label=26, title=17, price=19, button=16, note=20)
CARD_LAYOUT_PX = dict(container=1260, gap=14, padding=8, card_padding=8, image_height=40, border=2, line_height=1.18)
ACES_COMMIT = "6c561d853dc7e7242cecec732bb9d92386a9ee33"   # ACES stylesheet commit used in v6

ACES_CSS = (HERE / "aces_style.css").read_text(encoding="utf-8")

def extra_css(cols):
    T, L = CARD_TEXT_PX, CARD_LAYOUT_PX
    return f"""
.results-container {{ grid-template-columns: repeat({cols}, 1fr) !important; max-width: {L['container']}px !important;
                      gap: {L['gap']}px !important; padding: {L['padding']}px !important; }}
.product-card {{ border: {L['border']}px solid #b9bec3 !important; }}
.product-image {{ height: {L['image_height']}px !important; }}
.product-info {{ padding: {L['card_padding']}px !important; }}
.product-title {{ font-size: {T['title']}px !important; }}
.product-price {{ font-size: {T['price']}px !important; }}
.add-to-cart {{ font-size: {T['button']}px !important; }}
.product-title-section {{ position: relative; margin-bottom: 5px; }}
.add-to-cart-section {{ display: flex; align-items: center; margin-top: 10px; width: 100%; justify-content: space-between; }}
.product-label {{ font-size: {T['label']}px; font-weight: 700; margin-right: 8px; }}
.spec-list {{ font-size: {T['spec']}px; line-height: {L['line_height']}; margin: 2px 0 6px 0; }}
.spec-line {{ margin: 0 0 2px 0; overflow-wrap: anywhere; }}
.results-note {{ max-width: {L['container']}px; margin: 10px auto 0 auto; font-size: {T['note']}px; padding: 0 15px; box-sizing: border-box; }}
.cart-status {{ max-width: {L['container']}px; margin: 8px auto; font-size: 16px; padding: 0 15px; font-weight: 600; }}
"""

def _svg(b):
    return "data:image/svg+xml;base64," + base64.b64encode(b).decode()
IMAGES = {   # the same neutral image on every card (no product photos), as in v6
    "ereader": _svg(b'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">'
        b'<rect x="70" y="8" width="80" height="124" rx="8" fill="#4a4f55" stroke="#2f3337" stroke-width="3"/>'
        b'<rect x="78" y="18" width="64" height="96" rx="2" fill="#d9dcd6"/>'
        b'<rect x="86" y="30" width="48" height="4" fill="#9a9e98"/><rect x="86" y="40" width="48" height="4" fill="#9a9e98"/>'
        b'<rect x="86" y="50" width="40" height="4" fill="#9a9e98"/><rect x="86" y="60" width="48" height="4" fill="#9a9e98"/>'
        b'<rect x="86" y="70" width="44" height="4" fill="#9a9e98"/></svg>'),
    "speaker": _svg(b'<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">'
        b'<rect x="40" y="34" width="140" height="76" rx="30" fill="#4a4f55" stroke="#2f3337" stroke-width="3"/>'
        b'<circle cx="82" cy="72" r="24" fill="#d9dcd6"/><circle cx="82" cy="72" r="9" fill="#9a9e98"/>'
        b'<circle cx="138" cy="72" r="24" fill="#d9dcd6"/><circle cx="138" cy="72" r="9" fill="#9a9e98"/></svg>'),
}
SEARCH_SVG = ('<svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:middle"><circle cx="10" cy="10" r="6.5" '
              'fill="none" stroke="#111" stroke-width="2.5"/><path d="M15 15l6 6" stroke="#111" stroke-width="2.5" stroke-linecap="round"/></svg>')

def card_html(p, image):
    rows = list(p["specs"]) + [["Customer rating", f"{float(p['rating']):.1f} / 5"],
                               ["Customer reviews", f"{int(p['reviews']):,}"]]
    spec_rows = "".join(f'<div class="spec-line"><b>{html.escape(str(k))}:</b> {html.escape(str(v))}</div>' for k, v in rows)
    pid = html.escape(p["id"])
    return f"""
        <div class="product-card" data-product-id="{pid}">
            <div class="product-image"><img src="{image}" alt=""></div>
            <div class="product-info">
                <div class="product-title-section"><h2 class="product-title"><span class="product-label">{pid}</span>{html.escape(p['title'])}</h2></div>
                <div class="spec-list">{spec_rows}</div>
                <div class="product-price"><span class="price-symbol">$</span><span class="price-amount">{float(p['price']):.2f}</span></div>
                <div class="add-to-cart-section"><div class="add-to-cart-wrapper">
                    <button class="add-to-cart" type="button" onclick="addToCart('{pid}')">Add to Cart</button></div></div>
            </div>
        </div>"""

def page_html(run, order, results):
    """results=False: the store's search page (empty box). True: the results page for the query."""
    q = html.escape(run["query"])
    head = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{'Search Results - ' + q if results else 'Store'}</title>
<style>{ACES_CSS}{extra_css(run['cols'])}</style></head><body>
<div class="header"><div class="search-container"><form action="results.html" method="get" id="search-form">
<input type="text" name="q" value="{q if results else ''}" placeholder="Search for products..."><button type="submit"><span class="search-icon">{SEARCH_SVG}</span></button>
</form></div></div>"""
    if not results:
        return head + "</body></html>"
    by_id = {p["id"]: p for p in run["products"]}
    image = IMAGES.get(run.get("image", "ereader"), IMAGES["ereader"])
    cards = "".join(card_html(by_id[i], image) for i in order)
    ids = [p["id"] for p in run["products"]]
    return head + f"""
<div class="results-note"><b>Results for "{q}" ({len(ids)} items).</b> Products are labelled {html.escape(ids[0])}–{html.escape(ids[-1])}.</div>
<div class="results-container">{cards}</div>
<div class="cart-status" id="cart-status" hidden></div><br><br>
<script>function addToCart(id) {{ document.body.setAttribute("data-cart", id);
  var s = document.getElementById("cart-status"); s.hidden = false; s.textContent = "Added " + id + " to cart"; }}</script>
</body></html>"""

# ---------------------------------------------------------------- Selenium (as in v6)
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def make_driver():
    opts = Options()
    for a in ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
              f"--window-size={WINDOW_WIDTH},{WINDOW_HEIGHT}", "--force-device-scale-factor=1"]:
        opts.add_argument(a)
    for a in os.environ.get("CHROME_EXTRA_ARGS", "").split():
        opts.add_argument(a)
    if os.environ.get("CHROME_BINARY"):
        opts.binary_location = os.environ["CHROME_BINARY"]
    if os.environ.get("CHROMEDRIVER"):
        from selenium.webdriver.chrome.service import Service
        d = webdriver.Chrome(service=Service(os.environ["CHROMEDRIVER"]), options=opts)
    else:
        d = webdriver.Chrome(options=opts)          # Selenium Manager fetches the matching driver
    d._window_fixed = False
    return d

class Pool:
    def __init__(self, n):
        self.q, self.n, self.made, self.lock = queue.Queue(), n, 0, threading.Lock()
    def get(self):
        with self.lock:
            if self.q.empty() and self.made < self.n:
                self.made += 1
                return make_driver()
        return self.q.get()
    def put(self, d):
        self.q.put(d)
    def replace(self, d):
        """A Chrome window that errored is closed and a fresh one takes its place."""
        try: d.quit()
        except Exception: pass
        return make_driver()

def with_driver(fn):
    """Run fn(driver) on a pooled Chrome window; if Chrome errors, retry once on a fresh window."""
    d = POOL.get()
    try:
        try:
            return fn(d)
        except Exception:
            d = POOL.replace(d)
            return fn(d)
    finally:
        POOL.put(d)

POOL = None
RUNS = {}            # run id -> {query, cols, image, products}
STORE_URL = None

def trial_dir(run_id, t):
    return SITE / re.sub(r"[^A-Za-z0-9_-]", "_", run_id) / f"trial_{int(t):04d}"

def write_trial(run_id, t, order):
    run = RUNS[run_id]
    d = trial_dir(run_id, t)
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(page_html(run, order, results=False), encoding="utf-8")
    (d / "results.html").write_text(page_html(run, order, results=True), encoding="utf-8")
    return f"{STORE_URL}/{d.relative_to(SITE).as_posix()}"

def open_results(driver, base, query, search_flow=True):
    """Go to the results page the ACES way: open the search page, type the query, submit."""
    for attempt in (1, 2):
        if search_flow:
            driver.get(f"{base}/index.html")
            box = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.NAME, "q")))
            box.clear()
            box.send_keys(query)
            box.send_keys(Keys.ENTER)
        else:
            driver.get(f"{base}/results.html")
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".results-container")))
        if driver._window_fixed:
            return
        # ACES sets the window so the visible page is exactly WINDOW_WIDTH x WINDOW_HEIGHT
        inner_w, inner_h = driver.execute_script("return [window.innerWidth, window.innerHeight]")
        driver._window_fixed = True
        if (inner_w, inner_h) != (WINDOW_WIDTH, WINDOW_HEIGHT):
            driver.set_window_size(2 * WINDOW_WIDTH - inner_w, 2 * WINDOW_HEIGHT - inner_h)
            continue
        return

def screenshot(run_id, t, order, search_flow=True):
    run = RUNS[run_id]
    base = write_trial(run_id, t, order)
    def go(d):
        open_results(d, base, run["query"], search_flow)
        bottom = d.execute_script("return document.querySelector('.results-container').getBoundingClientRect().bottom")
        cut = d.execute_script("""
          return [...document.querySelectorAll('.spec-line, .product-title, .product-price')].filter(e =>
            e.getBoundingClientRect().right > e.closest('.product-card').getBoundingClientRect().right + 1).length""")
        return d.current_url, bottom, cut, d.execute_script("return [window.innerWidth, window.innerHeight]"), d.get_screenshot_as_png()
    url, bottom, cut, inner, png = with_driver(go)
    if bottom > WINDOW_HEIGHT:
        raise RuntimeError(f"The grid ends at {bottom:.0f}px, below the {WINDOW_HEIGHT}px window, so the bottom row would be cut off.")
    return {"png": "data:image/png;base64," + base64.b64encode(png).decode(), "url": url,
            "searched": search_flow and "results.html?q=" in url, "grid_bottom": round(bottom),
            "window": inner, "text_overflow": cut}

def click(run_id, t, pid, search_flow=True):
    run = RUNS[run_id]
    base = f"{STORE_URL}/{trial_dir(run_id, t).relative_to(SITE).as_posix()}"
    def go(d):
        open_results(d, base, run["query"], search_flow)
        d.find_element(By.CSS_SELECTOR, f'.product-card[data-product-id="{pid}"] button.add-to-cart').click()
        return d.execute_script("return document.body.getAttribute('data-cart')") == pid
    return {"ok": bool(with_driver(go))}

# ---------------------------------------------------------------- web server
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(HERE), **k)
    def log_message(self, *a):
        pass
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def translate_path(self, path):
        p = urlparse(path).path
        if p.startswith("/store/"):
            return str(SITE / p[len("/store/"):])
        if p in ("/", ""):
            return str(HERE / "index.html")
        name = Path(p).name
        if p.count("/") == 1 and name in ("index.html", "aces_style.css"):   # only these files from the folder
            return str(HERE / name)
        return str(SITE / "__none__")
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path.startswith("/api/health"):
            return self._json(200, {"ok": True, "helper": VERSION, "aces_commit": ACES_COMMIT,
                                    "window": [WINDOW_WIDTH, WINDOW_HEIGHT], "drivers": POOL.n})
        return super().do_GET()
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if self.path == "/api/aces/prepare":
                RUNS[body["run"]] = {"query": body["query"], "cols": int(body.get("cols", 5)),
                                     "image": body.get("image", "ereader"), "products": body["products"]}
                return self._json(200, {"ok": True})
            if self.path == "/api/aces/screenshot":
                return self._json(200, screenshot(body["run"], body["trial"], body["order"], body.get("search", True)))
            if self.path == "/api/aces/click":
                return self._json(200, click(body["run"], body["trial"], body["product_id"], body.get("search", True)))
            return self._json(404, {"error": "unknown endpoint"})
        except Exception as e:
            return self._json(500, {"error": f"{type(e).__name__}: {e}"[:600]})

def main():
    global POOL, STORE_URL
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--drivers", type=int, default=4)
    ap.add_argument("--no-open", action="store_true")
    a = ap.parse_args()
    POOL = Pool(max(1, a.drivers))
    STORE_URL = f"http://127.0.0.1:{a.port}/store"
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"LLM Conjoint Lab helper {VERSION}: http://127.0.0.1:{a.port}  (Ctrl+C to stop)")
    print("Starting one headless Chrome to check Selenium works ...", flush=True)
    d = POOL.get(); POOL.put(d)
    print("Selenium OK. Up to", a.drivers, "Chrome windows will work in parallel.", flush=True)
    if not a.no_open:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://127.0.0.1:{a.port}/")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        while not POOL.q.empty():
            try: POOL.q.get_nowait().quit()
            except Exception: pass

if __name__ == "__main__":
    main()
