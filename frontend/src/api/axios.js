// client/src/api/axios.js

import axios from 'axios'

//const baseUrl = '/api'
const baseUrl = 'http://localhost:5001/api';

class HttpRequest {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
  }

  getInsideConfig() {
    const config = {
      baseUrl: this.baseUrl,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        'X-Session-Key': localStorage.getItem('publicKey') || '',
      },
    };
    return config;
  }
  interceptors(instance) {
    instance.interceptors.request.use(function (config) {
      return config;
    }, function (error) {
      return Promise.reject(error);
    });

    instance.interceptors.response.use(function (response) {
      return response;
    }, function (error) {
      console.log(error, 'error')
      return Promise.reject(error);
    });
  }
  request(options) {
    const instance = axios.create()
    options = { ...this.getInsideConfig(), ...options }
    this.interceptors(instance)
    return instance(options)
  }
}
export default new HttpRequest(baseUrl)