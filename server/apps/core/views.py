from django.conf import settings
from django.db import DatabaseError, connection
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Public liveness and database check used by Docker and load balancers."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            database, code = "ok", status.HTTP_200_OK
        except DatabaseError:
            database, code = "unavailable", status.HTTP_503_SERVICE_UNAVAILABLE

        return Response(
            {
                "status": "ok" if code == status.HTTP_200_OK else "degraded",
                "database": database,
                "version": settings.CMS_VERSION,
            },
            status=code,
        )
