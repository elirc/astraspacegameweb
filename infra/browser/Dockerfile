FROM warband-web:local
USER root
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN node node_modules/@playwright/test/cli.js install --with-deps webkit
USER node
