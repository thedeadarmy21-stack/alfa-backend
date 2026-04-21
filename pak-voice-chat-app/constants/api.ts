import axios from "axios";
export const API_BASE_URL = "https://alfa-backend-seven.vercel.app";
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});