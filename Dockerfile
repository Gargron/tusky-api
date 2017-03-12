FROM node:boron

ENV NODE_ENV=production

RUN adduser --disabled-login --gecos 'Tusky' tusky

RUN mkdir /tusky
WORKDIR /tusky

ADD package.json /tusky/package.json
ADD yarn.lock /tusky/yarn.lock
RUN yarn

ADD . /tusky
RUN chown -hR tusky:tusky /tusky
USER tusky

EXPOSE 3000
VOLUME ["/tusky/db"]
CMD ["npm", "start"]
