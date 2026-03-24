import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { ERPProjectDetail, ERPProjectSearchResult } from '../types/sample.types';

/**
 * Search for projects by ProjectId or CustomerName
 */
export const searchProjects = async (
  query: string,
  limit: number = 10
): Promise<ERPProjectSearchResult[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${API_ENDPOINTS.erpProjectsSearch}?q=${encodeURIComponent(query)}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`Failed to search projects: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching projects:', error);
    throw error;
  }
};

/**
 * Get full project details by ProjectId
 */
export const getProjectDetails = async (
  projectId: string
): Promise<ERPProjectDetail> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}${API_ENDPOINTS.erpProjectDetail(projectId)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get project details: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting project details:', error);
    throw error;
  }
};

/**
 * Get paginated list of projects with optional search
 */
export const listProjects = async (
  skip: number = 0,
  limit: number = 20,
  search?: string
): Promise<ERPProjectDetail[]> => {
  try {
    let url = `${API_BASE_URL}${API_ENDPOINTS.erpProjectsList}?skip=${skip}&limit=${limit}`;
    if (search && search.trim()) {
      url += `&search=${encodeURIComponent(search.trim())}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing projects:', error);
    throw error;
  }
};
