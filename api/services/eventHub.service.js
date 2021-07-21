class EventHub {
  static subscriptions = new Proxy(
    {},
    {
      get: (target, name) => (target.hasOwnProperty(name) ? target[name] : []),
    }
  );

  static publish = async (channel, event) => {
    const results = await Promise.all(this.subscriptions[channel].map(async (fn) => {
      try {
        return await fn(event);
      } catch(error) {
        return { error };
      }
    }));

    const errors = results
      .map(result => result.error)
      .filter(error => error);

    if (errors.length) {
      errors.map(console.error);
      throw new Error(errors.join(", "));
    }

    return results.reduce((hash, result) => ({
      ...result,
      ...hash
    }), {})
  };

  static subscribe(channel, namespace, fn) {
    this.subscriptions[channel] = this.subscriptions[channel].concat(async (...args) => ({
      [namespace]: (await fn(...args))
    }));
  }
}

module.exports = EventHub;
