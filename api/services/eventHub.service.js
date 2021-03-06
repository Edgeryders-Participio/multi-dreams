class EventHub {
  static subscriptions = new Proxy(
    {},
    {
      get: (target, name) => (target.hasOwnProperty(name) ? target[name] : []),
    }
  );

  static publish = async (channel, event) => {
    const errors = await this.subscriptions[channel].reduce(
      async (result, fn) => {
        try {
          await fn(event);
          return result;
        } catch (err) {
          console.error(err);
          if (result.concat) return result.concat(err);
          return result;
        }
      },
      []
    );

    if (errors.length) {
      errors.map(console.error);
      throw new Error(errors.join(", "));
    }
  };

  static subscribe(channel, fn) {
    this.subscriptions[channel] = this.subscriptions[channel].concat(fn);
  }
}

module.exports = EventHub;
