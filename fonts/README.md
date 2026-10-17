# Fonts for Annex 8 PDF conversion

`docker/gotenberg.Dockerfile` copies this directory into the Gotenberg image
and runs `fc-cache`, so LibreOffice can resolve the fonts the Annex 8 template
uses by name.

Required files:

| File | Used for |
|---|---|
| `KhmerOSsiemreap.ttf` | body text throughout the report |
| `KhmerOSmuollight.ttf` | the Muol headings on the cover letter and part titles |

Both are present. The image build fails loudly (`fc-list \| grep -i khmer`) if
they ever go missing, rather than producing PDFs with silently substituted
glyphs — LibreOffice does not report a substitution, it just draws the wrong
shapes, and broken Khmer in an official annex is not something a reviewer
would necessarily catch.

They are the Khmer OS fonts published by the Ministry of Posts and
Telecommunications / Open Forum of Cambodia; redistribute according to their
own licence.
