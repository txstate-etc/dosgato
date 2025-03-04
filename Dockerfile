FROM node:20-alpine as build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src
COPY testserver testserver

RUN npm run buildrun

FROM node:20-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /usr/app/dist dist
COPY tsconfig.json ./
COPY test/files/blankpdf.pdf /files/storage/P/K/BUoghpogATqmK14ry1wqKsP-e-S8GVqHKuCxH7k1k
COPY test/files/bobcat.jpg /files/storage/Q/7/HN1moFtRWxE_gLyvxM8B2sK5CrjB3482LttjgbWME
COPY test/files/flower.jpg /files/storage/v/3/SP_esEVWfVvLuA7HyOPMAuMVI0mw-jpAr3DpmRsf4
RUN node -e 'console.log(new Date().getTime())' > /.builddate

CMD [ "npm", "start" ]
