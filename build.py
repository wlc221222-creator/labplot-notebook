"""Build or check the portable, offline copy of LabPlot using Python 3."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def bundle():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    stylesheet = '<link rel="stylesheet" href="app.css">'
    if html.count(stylesheet) != 1:
        raise ValueError("Expected one app.css link in index.html")
    css = (ROOT / "app.css").read_text(encoding="utf-8")
    html = html.replace(stylesheet, "<style>\n" + css + "\n</style>")
    scripts = []
    for name in ("model.js", "chart.js", "stars.js", "app.js"):
        tag = f'<script defer src="{name}"></script>'
        if html.count(tag) != 1:
            raise ValueError(f"Expected one {name} script in index.html")
        html = html.replace("  " + tag + "\n", "")
        code = (ROOT / name).read_text(encoding="utf-8")
        scripts.append("<script>\n" + code.replace("</script", r"<\/script") + "\n</script>")
    return html.replace("</body>", "\n".join(scripts) + "\n</body>")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify the checked-in build")
    args = parser.parse_args()
    output = ROOT / "LabPlot.html"
    content = bundle()
    if args.check:
        if not output.exists() or output.read_bytes() != content.encode("utf-8"):
            parser.exit(1, "LabPlot.html is out of date. Run python3 build.py\n")
        print("LabPlot.html matches the source")
    else:
        output.write_bytes(content.encode("utf-8"))
        print("Built LabPlot.html")
