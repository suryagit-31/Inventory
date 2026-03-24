from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import case, func
from typing import List

from app.database import get_erp_db
from app.models.erp_project import ERPProjectDetail
from app.schemas.erp_project import ERPProjectDetailResponse, ERPProjectSearchResult

router = APIRouter(
    prefix="/api/erp/projects",
    tags=["ERP Projects"],
)


@router.get("/search", response_model=List[ERPProjectSearchResult])
def search_projects(
    q: str = Query(..., min_length=1, description="Search term for ProjectId or CustomerName"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results"),
    db: Session = Depends(get_erp_db),
):
    """
    Search for projects by ProjectId or CustomerName.
    Returns a simplified list for dropdown/autocomplete.
    """
    # Search by ProjectId or CustomerName (case-insensitive).
    # Order results so "starts with" matches appear first (more intuitive for short queries like "BR").
    q_norm = q.strip().lower()
    starts = f"{q_norm}%"
    contains = f"%{q_norm}%"
    project_id_l = func.lower(ERPProjectDetail.ProjectId)
    customer_name_l = func.lower(ERPProjectDetail.CustomerName)

    rank = case(
        (project_id_l.like(starts), 0),
        (customer_name_l.like(starts), 1),
        (project_id_l.like(contains), 2),
        (customer_name_l.like(contains), 3),
        else_=4,
    )

    projects = (
        db.query(ERPProjectDetail)
        .filter(
            (project_id_l.like(contains)) |
            (customer_name_l.like(contains))
        )
        .order_by(rank, ERPProjectDetail.ProjectId.asc())
        .limit(limit)
        .all()
    )

    return projects


@router.get("/{project_id}", response_model=ERPProjectDetailResponse)
def get_project_details(
    project_id: str,
    db: Session = Depends(get_erp_db),
):
    """
    Get full project details by ProjectId.
    Used to pre-fill the sample issue form.
    """
    project = (
        db.query(ERPProjectDetail)
        .filter(ERPProjectDetail.ProjectId == project_id)
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=404,
            detail=f"Project with ID '{project_id}' not found"
        )

    return project


@router.get("/", response_model=List[ERPProjectDetailResponse])
def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    db: Session = Depends(get_erp_db),
):
    """
    Get paginated list of all projects with optional search by ProjectId or CustomerName.
    """
    query = db.query(ERPProjectDetail)

    # Apply search filter
    if search:
        search_term = search.strip()
        if search_term:
            search_filter = f"%{search_term}%"
            query = query.filter(
                (ERPProjectDetail.ProjectId.ilike(search_filter)) |
                (ERPProjectDetail.CustomerName.ilike(search_filter))
            )

    # Return projects ordered by creation date (newest first)
    return (
        query
        .order_by(ERPProjectDetail.createdOn.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
