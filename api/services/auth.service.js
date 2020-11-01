const jwt = require('jsonwebtoken');
const MailgunService = require('./EmailService/email.service');
const EmailService = require('./EmailService/email.service');
const { isValidEmail } = require('../utils/email');

const jwtSecretKey = process.env.JWT_SECRET;
const jwtOptions = {
  // issuer:
  // audience:
  algorithm: 'HS256',
  expiresIn: '30d'
};

class AuthService {

  static generateLoginJWT(user) {
    return new Promise((resolve, reject) => {
      return jwt.sign(
        { sub: user.id },
        jwtSecretKey,
        jwtOptions,
        (err, token) => {
          if (err) {
            reject(err);
          } else {
            resolve(token);
          }
        }
      );
    });
  };

  static async sendMagicLink({ inputEmail, currentOrg, models: { User, Member, Event } }
  ) {
    const trimmedEmail = inputEmail.trim();
    if (!isValidEmail(trimmedEmail)) throw new Error('Not a valid email address');
    const email = trimmedEmail.toLowerCase();
  
    let user;
    if(currentOrg) {
      user = await User.findOne({ email, organizationId: currentOrg.id });
    }
    
    if (!user) {
      user = await new User({ email, organizationId: currentOrg.id }).save();
    }

    const token = await this.generateLoginJWT(user);
    const isSentSuccess = await EmailService.sendMagicLinkEmail(token, currentOrg, user);
    
    return {
      isSentSuccess,
      user
    }
  }
}

module.exports = AuthService;