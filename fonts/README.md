# Fonts for Annex 8 PDF conversion

`docker/gotenberg.Dockerfile` copies this directory into the Gotenberg image
and runs `fc-cache`, so LibreOffice can resolve the fonts the Annex 8 template
uses by name.

Required files (not committed — they are Khmer OS system fonts, redistribute
according to their own licence):

| File | Used for |
|---|---|
| `KhmerOSsiemreap.ttf` | body text throughout the report |
| `KhmerOSmuollight.ttf` | the Muol headings on the cover letter and part titles |

Drop the `.ttf` files here before building the image. The build fails loudly
(`fc-list \| grep -i khmer`) if they are missing, rather than producing PDFs
with silently substituted glyphs.
