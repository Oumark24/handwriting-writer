# My Handwriting Writer

A small phone-friendly web page that writes text in **your own handwriting** (the "My Handwriting" font) onto a photo of a worksheet, or onto lined paper, and gives you a PDF or image.

Everything runs inside your browser. Photos and answers are never uploaded anywhere.

## How to use it (from your phone)

1. Take a photo of the worksheet and send it to any AI chatbot (Gemini, ChatGPT, etc.) along with the note below. The chatbot replies with plain numbered answers.
2. Copy the reply.
3. Open the website. In **On my worksheet photo** mode, upload the same photo.
4. Paste the reply into the answers box and tap **Split numbered answers into boxes**. (Or use **Put it all in one box**.)
5. Drag each box onto its blank. A selected box has two round handles: bottom-right changes the size, top-right changes the line width. The panel below has size, tilt, line gap, ink colour and nudge arrows.
6. Tap **Download PDF** (or **This page as image**).

For essays or plain notes, use **Lined paper** mode: paste the text and download. It makes as many pages as needed.

You can add several photos (one per page) and the PDF will contain all of them.

## Note to paste into the chatbot

The site also has a **Copy note** button with this text:

```
Please answer the questions in the attached worksheet in PLAIN TEXT only.
- Number every answer to match the question number: 1. 2. 3. (one answer per number).
- If a question has parts, label them a) b) c) on separate lines under that number.
- No bold, no italics, no bullet points, no tables, no headings, no LaTeX, no emoji.
- Keep each answer short enough to fit in a blank on the worksheet. No explanations unless a question asks for one.
- Only use letters, numbers and these symbols: . , ; : ! ? ' " ( ) - + / & @ # $
- Write other symbols out in words (say "percent" instead of %, "equals" instead of =, "degrees" instead of the degree sign).
- Write math simply, like 3/4, x^2, sqrt(9), 2 x 5.
- Give me only the numbered answers, nothing before or after them.
```

## About the font

`fonts/MyHandwriting.woff2` / `.ttf` are used exactly as drawn: no smoothing, no redrawing, no swapped letters. The font has letters A-Z and a-z, digits 0-9 and these symbols: `! " # $ & ' ( ) + , - . / : ; ? @`.
It does not have `%`, `=`, `*`, `<`, `>`, `_`, brackets other than `( )`, or accented letters yet. If those appear in the text, the site warns you and shows them in a plain font until they are added to the font.

The site only does these tiny clean-ups before writing: curly quotes become straight quotes, long dashes become `-`, and `**` / `__` chatbot formatting marks are removed.

## Files

- `index.html`, `style.css`, `app.js`: the whole site, no libraries and nothing to install.
- `fonts/`: the handwriting font.

To run it locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
