#!/usr/bin/env python3
import argparse
import json
import random
import re
import sys
import time
from contextlib import contextmanager

SBS_URL = "https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx"


def _normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _parse_bool_flag(raw, default: bool = True) -> bool:
    normalized = str(raw if raw is not None else "").strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _positive_timeout_ms(raw) -> int:
    value = int(raw)
    if value <= 0:
        raise argparse.ArgumentTypeError("timeout-ms must be greater than zero")
    return value


def _to_rate(raw: str) -> float:
    cleaned = str(raw).strip().replace("S/", "").replace(",", ".")
    return round(float(cleaned), 4)


def _extract_date(text: str) -> str | None:
    patterns = [
        r"(\d{2}/\d{2}/\d{4})",
        r"(\d{4}-\d{2}-\d{2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return None


def _extract_rates(text: str) -> tuple[float, float] | None:
    normalized = _normalize_spaces(text)
    patterns = [
        r"compra[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))[^0-9]{0,80}venta[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))",
        r"venta[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))[^0-9]{0,80}compra[^0-9]{0,20}(\d+(?:[.,]\d{3,4}))",
    ]
    for index, pattern in enumerate(patterns):
        match = re.search(pattern, normalized, re.IGNORECASE)
        if not match:
            continue
        if index == 0:
            return _to_rate(match.group(1)), _to_rate(match.group(2))
        return _to_rate(match.group(2)), _to_rate(match.group(1))
    return None


def _collect_text_candidates(page) -> list[str]:
    candidates = []

    def _append(candidate: str | None) -> None:
        if candidate:
            candidates.append(candidate)

    try:
        _append(page.locator("body").inner_text(timeout=5000))
    except Exception:
        pass

    try:
        _append(page.content())
    except Exception:
        pass

    try:
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            try:
                _append(frame.locator("body").inner_text(timeout=1500))
            except Exception:
                continue
    except Exception:
        pass

    return candidates


def _extract_payload_from_page(page) -> dict | None:
    for candidate in _collect_text_candidates(page):
        rates = _extract_rates(candidate)
        if not rates:
            continue
        compra, venta = rates
        return {
            "compra": compra,
            "venta": venta,
            "fecha": _extract_date(candidate) or time.strftime("%Y-%m-%d"),
        }
    return None


@contextmanager
def _camoufox_browser(headless: bool):
    from camoufox.sync_api import Camoufox

    viewport = random.choice([(1440, 900), (1536, 864), (1920, 1080)])
    with Camoufox(
        headless=headless,
        humanize=True,
        os="windows",
        locale="es-PE",
        window=viewport,
    ) as browser:
        yield browser, "camoufox"


@contextmanager
def _playwright_browser(headless: bool, browser_channel: str):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser_type = playwright.chromium
        launch_kwargs = {
            "headless": headless,
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ],
        }
        if browser_channel:
            launch_kwargs["channel"] = browser_channel
        browser = browser_type.launch(**launch_kwargs)
        try:
            yield browser, "playwright"
        finally:
            browser.close()


def _fetch_with_browser(headless: bool, use_camoufox: bool, browser_channel: str, timeout_ms: int) -> dict:
    last_error = None

    browser_factories = []
    if use_camoufox:
        browser_factories.append(lambda: _camoufox_browser(headless))
    browser_factories.append(lambda: _playwright_browser(headless, browser_channel))

    for factory in browser_factories:
        try:
            with factory() as (browser, engine):
                page = browser.new_page()
                page.goto(SBS_URL, wait_until="domcontentloaded", timeout=timeout_ms)

                deadline = time.time() + max(8, timeout_ms / 1000)
                while time.time() < deadline:
                    payload = _extract_payload_from_page(page)
                    if payload:
                        payload.update(
                            {
                                "source": "SBS_oficial_stealth",
                                "status": "oficial_en_vivo",
                                "strategy": "stealth_browser",
                                "official": True,
                                "engine": engine,
                            }
                        )
                        return payload

                    try:
                        page.wait_for_load_state("networkidle", timeout=2500)
                    except Exception:
                        pass
                    time.sleep(1.5)

                last_error = RuntimeError("No se pudo extraer compra/venta desde SBS con navegador.")
        except Exception as exc:
            last_error = exc

    raise last_error or RuntimeError("No se pudo iniciar el navegador resistente.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Obtiene tipo de cambio oficial SBS con navegador resistente.")
    parser.add_argument("--timeout-ms", type=_positive_timeout_ms, default=45000)
    parser.add_argument("--headless", default="1")
    parser.add_argument("--use-camoufox", default="1")
    parser.add_argument("--browser-channel", default="")
    args = parser.parse_args()

    headless = _parse_bool_flag(args.headless, default=True)
    use_camoufox = _parse_bool_flag(args.use_camoufox, default=True)

    try:
        payload = _fetch_with_browser(headless, use_camoufox, args.browser_channel, args.timeout_ms)
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
