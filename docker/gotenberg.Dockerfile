# Gotenberg with the Khmer fonts the Annex 8 layout needs.
#
# LibreOffice inside stock Gotenberg has no Khmer OS Siemreap or Khmer OS Muol
# Light, so it silently substitutes a fallback and the converted PDF comes out
# with broken or tofu Khmer text. The fonts are installed here and fc-cache is
# run so LibreOffice can actually resolve them by name.
#
# Build:  docker build -f docker/gotenberg.Dockerfile -t mlrs-gotenberg .
# Run:    docker run --rm -p 3001:3000 mlrs-gotenberg
# Then:   GOTENBERG_URL=http://localhost:3001
FROM gotenberg/gotenberg:8

USER root

# Font files live in ./fonts at the repo root (see fonts/README.md).
COPY fonts/ /usr/share/fonts/truetype/khmer-nmc/

RUN chmod -R 0644 /usr/share/fonts/truetype/khmer-nmc/ \
    && fc-cache -f -v \
    && fc-list | grep -i khmer || (echo "Khmer fonts not registered" && exit 1)

USER gotenberg
