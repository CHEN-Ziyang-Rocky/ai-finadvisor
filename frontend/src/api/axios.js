// client/src/api/axios.js

import axios from 'axios'
import { API_BASE } from './base'

const baseUrl = API_BASE;

class HttpRequest {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
  }

  getInsideConfig() {
    const config = {
      baseURL: this.baseUrl,
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
